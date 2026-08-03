import { notFound } from 'next/navigation'
import { getOrganizationBySlug } from '@/lib/data/organization-slug'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getServices } from '@/lib/data/business'
import { getPublicAgentsForOrg } from '@/lib/data/agents'
import { getStaffForBookingPage } from '@/lib/data/availability-engine'
import { getPublicBookingPageConfig } from '@/lib/data/booking-page-config'
import { BookingPagePublicClient } from './booking-page-public-client'

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const org = await getOrganizationBySlug(slug)
  if (!org) notFound()

  const [settings, services, agents, staff, config] = await Promise.all([
    getOrganizationSettings(org.id),
    getServices(org.id),
    getPublicAgentsForOrg(org.id),
    getStaffForBookingPage(org.id),
    getPublicBookingPageConfig(org.id),
  ])

  if (!settings.id || !settings.bookingPageEnabled) notFound()

  const agent = agents[0] ?? null

  return (
    <BookingPagePublicClient
      organizationId={org.id}
      organizationName={org.name}
      services={services.filter((s) => s.showOnBookingPage)}
      staff={config.showStaffSelection ? staff : []}
      agentId={agent?.id ?? null}
      agentName={agent ? (agent.businessName ?? agent.name) : org.name}
      theme={settings.bookingPageTheme}
      accent={settings.bookingPageAccent}
      config={config}
    />
  )
}
