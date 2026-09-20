import type { MetadataRoute } from 'next'
import { getPublicBookingPageSlugs } from '@/lib/data/organization-slug'
import { absoluteUrl } from '@/lib/seo/site'

/**
 * Served at /sitemap.xml.
 *
 * Only genuinely public URLs belong here. That is the marketing root plus every
 * live booking page — the dashboard is authenticated and disallowed in
 * robots.txt, so listing it would be contradictory.
 *
 * `force-dynamic` because the set of live booking pages changes whenever an
 * operator toggles online booking; a build-time snapshot would go stale
 * immediately.
 */
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const bookingPages = await getPublicBookingPageSlugs()

  return [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...bookingPages.map((page) => ({
      url: absoluteUrl(`/smb/${page.slug}`),
      lastModified: page.updatedAt ? new Date(page.updatedAt) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
