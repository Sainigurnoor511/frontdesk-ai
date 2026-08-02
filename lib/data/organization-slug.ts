import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SupabaseClient } from '@supabase/supabase-js'

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function generateUniqueSlug(
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const base = slugify(name) || 'business'
  let candidate = base
  let suffix = 2

  while (true) {
    const { data } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()

    if (!data) return candidate
    candidate = `${base}-${suffix}`
    suffix += 1
  }
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
