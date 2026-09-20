import { ImageResponse } from 'next/og'
import { getBusinessProfile } from '@/lib/data/business'
import { getOrganizationBySlug } from '@/lib/data/organization-slug'
import { SITE_NAME } from '@/lib/seo/site'

/**
 * Per-business social card, so sharing a booking link in a chat or on social
 * shows the business's own name rather than our product's generic card. This is
 * the link operators actually distribute, so it's the card that matters most.
 */
export const alt = 'Book an appointment'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function BookingPageOpengraphImage({
  params,
}: {
  params: { slug: string }
}) {
  const org = await getOrganizationBySlug(params.slug)
  const businessName = org
    ? ((await getBusinessProfile(org.id)).businessName ?? org.name)
    : 'Book an appointment'

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
          backgroundColor: '#fafafa',
          backgroundImage:
            'radial-gradient(900px circle at 100% 0%, #dbeafe 0%, transparent 55%)',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, color: '#52525b' }}>
          Book an appointment with
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 20,
            fontSize: 76,
            lineHeight: 1.1,
            color: '#09090b',
            letterSpacing: '-0.03em',
            // Long business names would otherwise overflow the card.
            maxWidth: 1000,
          }}
        >
          {businessName}
        </div>
        <div style={{ display: 'flex', marginTop: 32, fontSize: 26, color: '#52525b' }}>
          Online booking, or talk to their receptionist now · Powered by {SITE_NAME}
        </div>
      </div>
    ),
    size
  )
}
