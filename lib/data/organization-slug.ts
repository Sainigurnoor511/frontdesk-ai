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
