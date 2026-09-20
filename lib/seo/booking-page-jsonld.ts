import type { Service } from '@/lib/data/business'

/**
 * Builds schema.org `LocalBusiness` JSON-LD for a public booking page.
 *
 * LocalBusiness is the right type here rather than Organization: these are
 * single-location service businesses (clinics, salons, studios) whose customers
 * search locally, and it's the type that supports opening hours, telephone, and a
 * reservation action.
 *
 * Only emits fields backed by real data. Structured data that claims an address
 * or rating the business never entered is worse than omitting it — Google treats
 * fabricated markup as a spam signal, and it can suppress the whole snippet.
 */
export function buildBookingPageJsonLd(input: {
  businessName: string
  canonicalUrl: string
  description: string
  telephone: string | null
  currency: string
  services: Service[]
}): Record<string, unknown> {
  const { businessName, canonicalUrl, description, telephone, currency, services } = input

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: businessName,
    description,
    url: canonicalUrl,
  }

  if (telephone) {
    jsonLd.telephone = telephone
  }

  if (services.length > 0) {
    jsonLd.makesOffer = services.map((service) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: service.name,
        ...(service.description ? { description: service.description } : {}),
      },
      // `price` is numeric in the DB; schema.org wants a string, and 0 is a
      // legitimate value (free consultations) so don't treat it as absent.
      ...(Number.isFinite(service.price)
        ? { price: String(service.price), priceCurrency: currency }
        : {}),
    }))
  }

  // Tells search engines the page is where a booking is made, which is what makes
  // it eligible to surface as a booking destination rather than a plain result.
  jsonLd.potentialAction = {
    '@type': 'ReserveAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: canonicalUrl,
      actionPlatform: [
        'http://schema.org/DesktopWebPlatform',
        'http://schema.org/MobileWebPlatform',
      ],
    },
    result: { '@type': 'Reservation', name: `Appointment with ${businessName}` },
  }

  return jsonLd
}
