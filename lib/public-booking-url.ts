/**
 * `NEXT_PUBLIC_SITE_URL` is `http://localhost:3000` in dev and the real
 * production domain when deployed (see .env.example) — using it here keeps
 * public booking links correct in both environments without a hardcoded host.
 */
export function getPublicBookingUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/smb/${slug}`
}

export function getPublicBookingPath(slug: string): string {
  return `/smb/${slug}`
}
