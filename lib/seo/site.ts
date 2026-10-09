/**
 * Canonical origin for the deployment, used for `metadataBase`, canonical URLs,
 * `robots.txt`, and the sitemap.
 *
 * Falls back to localhost rather than throwing so builds and local dev work
 * without the variable set. A wrong origin only degrades canonical/OG URLs; it
 * shouldn't break the build.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'
  // Trailing slashes produce `//path` when joined, which some crawlers treat as
  // a distinct URL.
  return raw.replace(/\/+$/, '')
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

export const SITE_NAME = 'Frontdesk.ai'
export const SITE_DESCRIPTION =
  'Open-source AI receptionist that answers calls, books appointments, and takes messages for your business.'

/**
 * Route prefixes that must never be indexed: authenticated product surfaces,
 * auth screens, and API routes. Shared by `robots.ts` and the per-route
 * `robots` metadata so the two can't disagree.
 *
 * The public booking pages under `/smb/` are deliberately absent — they are the
 * one surface that should be crawlable.
 */
export const PRIVATE_PATH_PREFIXES = [
  '/api/',
  '/agents',
  '/analytics',
  '/assistant',
  '/availability',
  '/booking-page',
  '/business',
  '/calendar',
  '/callback',
  '/clients',
  '/conversations',
  '/guides',
  '/integrations',
  '/onboarding',
  '/phone-numbers',
  '/settings',
  '/staff',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/signup',
]
