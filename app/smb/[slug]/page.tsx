import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getOrganizationBySlug } from '@/lib/data/organization-slug'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getServices, getBusinessProfile } from '@/lib/data/business'
import { getPublicAgentsForOrg } from '@/lib/data/agents'
import { getStaffForBookingPage } from '@/lib/data/availability-engine'
import { getPublicBookingPageConfig } from '@/lib/data/booking-page-config'
import { getAgentStaffPhoneServiceRole } from '@/lib/data/agents-service'
import { buildBookingPageJsonLd } from '@/lib/seo/booking-page-jsonld'
import { absoluteUrl } from '@/lib/seo/site'
import { BookingPagePublicClient } from './booking-page-public-client'

function bookingPageDescription(businessName: string): string {
  return `Book an appointment with ${businessName} online, or call and speak to their receptionist right from your browser.`
}

/**
 * The only route in the app that should be indexed.
 *
 * The root layout sets `robots: { index: false }` because everything else is an
 * authenticated dashboard; this route opts back in, and only when the page is
 * actually live. A disabled or unknown slug renders 404, so it stays noindex to
 * avoid accumulating soft-404s in the index.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const org = await getOrganizationBySlug(slug)

  if (!org) {
    return { title: 'Booking page not found', robots: { index: false, follow: false } }
  }

  const [settings, businessProfile] = await Promise.all([
    getOrganizationSettings(org.id),
    getBusinessProfile(org.id),
  ])

  const businessName = businessProfile.businessName ?? org.name
  const isLive = Boolean(settings.id && settings.bookingPageEnabled)
  const canonical = `/smb/${slug}`
  const description = bookingPageDescription(businessName)

  return {
    // Overrides the root template so a shared link reads as the business, not as
    // our product: "Acme Dental — Book an appointment".
    title: { absolute: `${businessName} — Book an appointment` },
    description,
    alternates: { canonical },
    robots: isLive
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      type: 'website',
      title: `${businessName} — Book an appointment`,
      description,
      url: canonical,
      siteName: businessName,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${businessName} — Book an appointment`,
      description,
    },
  }
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { slug } = await params
  const { preview } = await searchParams
  const previewMode = preview === '1'

  const org = await getOrganizationBySlug(slug)
  if (!org) notFound()

  const [settings, services, agents, staff, config, businessProfile] = await Promise.all([
    getOrganizationSettings(org.id),
    getServices(org.id),
    getPublicAgentsForOrg(org.id),
    getStaffForBookingPage(org.id),
    getPublicBookingPageConfig(org.id),
    getBusinessProfile(org.id),
  ])

  // Preview mode (embedded in the editor's own iframe) bypasses the enabled
  // gate — the owner needs to see how the page looks while still configuring
  // it, before flipping "Enable online booking" on.
  if (!previewMode && (!settings.id || !settings.bookingPageEnabled)) notFound()

  const agent = agents[0] ?? null
  const staffPhoneNumber =
    config.showPhoneFallback && agent
      ? await getAgentStaffPhoneServiceRole(agent.id)
      : null

  const bookableServices = services.filter((s) => s.showOnBookingPage)
  const businessName = businessProfile.businessName ?? org.name

  // Only emit structured data for a live page. Marking up a preview (which is
  // gated behind the operator's own iframe and 404s for everyone else) would
  // describe a URL the public can't reach.
  const jsonLd = previewMode
    ? null
    : buildBookingPageJsonLd({
        businessName,
        canonicalUrl: absoluteUrl(`/smb/${slug}`),
        description: bookingPageDescription(businessName),
        telephone: staffPhoneNumber,
        currency: businessProfile.currency,
        services: bookableServices,
      })

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          // Serialized via JSON.stringify of a server-built object, so the only
          // injection risk is a business name containing `</script>`; escaping
          // the `<` closes that off.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
      )}
      <BookingPagePublicClient
        organizationId={org.id}
        organizationName={org.name}
        services={bookableServices}
        staff={config.showStaffSelection ? staff : []}
        agentId={agent?.id ?? null}
        agentName={agent ? (agent.businessName ?? agent.name) : org.name}
        staffPhoneNumber={staffPhoneNumber}
        theme={settings.bookingPageTheme}
        accent={settings.bookingPageAccent}
        config={config}
        previewMode={previewMode}
        timezone={businessProfile.timezone}
      />
    </>
  )
}
