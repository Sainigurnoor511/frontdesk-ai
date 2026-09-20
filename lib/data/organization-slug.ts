import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SupabaseClient } from '@supabase/supabase-js'

// Dashes runs of non-alphanumerics rather than stripping them, matching the
// SQL backfill (supabase/migrations/00000000000016_backfill_organization_slug.sql,
// `regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')`) so a newly-created org and
// a backfilled one with the same name produce the same slug.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function generateUniqueSlug(
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const base = slugify(name) || 'business'
  let candidate = base
  let suffix = 2

  while (suffix <= 1000) {
    const { data } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()

    if (!data) return candidate
    candidate = `${base}-${suffix}`
    suffix += 1
  }

  throw new Error(`Could not generate a unique slug for "${name}"`)
}

export async function getOrganizationBySlug(
  slug: string
): Promise<{ id: string; name: string } | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()

  return data
}

/**
 * Slugs of organizations whose public booking page is live, for the sitemap.
 *
 * Mirrors the gate in `app/smb/[slug]/page.tsx`: a row in `organization_settings`
 * with `booking_page_enabled` true. Listing a disabled page would advertise a URL
 * that answers 404, which is worse for crawl budget than omitting it.
 *
 * Uses the service-role client because the sitemap is generated without a user
 * session, and returns an empty list on failure so a transient database error
 * degrades to an empty sitemap rather than a 500 on /sitemap.xml.
 */
export async function getPublicBookingPageSlugs(): Promise<
  Array<{ slug: string; updatedAt: string | null }>
> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('organization_settings')
    .select('booking_page_enabled, organizations!inner(slug, updated_at)')
    .eq('booking_page_enabled', true)

  if (error) {
    console.error('getPublicBookingPageSlugs failed:', error.message)
    return []
  }

  type Row = { organizations: { slug: string | null; updated_at: string | null } | null }

  return ((data ?? []) as unknown as Row[])
    .map((row) => row.organizations)
    .filter((org): org is { slug: string; updated_at: string | null } => Boolean(org?.slug))
    .map((org) => ({ slug: org.slug, updatedAt: org.updated_at }))
}
