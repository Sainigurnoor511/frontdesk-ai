import { ImageResponse } from 'next/og'
import { Logo, LOGO_ASPECT } from '@/components/brand/logo'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo/site'

/**
 * Default social preview card. Next serves this at /opengraph-image and wires the
 * `og:image` tag automatically, so every page that doesn't define its own card
 * inherits this one.
 *
 * Generated rather than a checked-in PNG so the copy stays in sync with
 * `lib/seo/site.ts` instead of requiring a designer round-trip on every wording
 * change.
 */
export const alt = `${SITE_NAME} — AI receptionist for your business`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#0a0a0a',
          // Warm highlight from the top-left so the card doesn't read as a flat
          // black rectangle in a crowded timeline.
          backgroundImage:
            'radial-gradient(900px circle at 0% 0%, #1e3a8a 0%, transparent 55%)',
        }}
      >
        <Logo title="" height={56} width={56 * LOGO_ASPECT} fill="#fafafa" />
        <div
          style={{
            display: 'flex',
            marginTop: 24,
            fontSize: 68,
            lineHeight: 1.1,
            color: '#fafafa',
            letterSpacing: '-0.03em',
          }}
        >
          An AI receptionist that actually answers
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 28,
            lineHeight: 1.4,
            color: '#a1a1aa',
            maxWidth: 900,
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    size
  )
}
