import { notFound } from 'next/navigation'
import { getOrganizationBySlug } from '@/lib/data/organization-slug'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getServices } from '@/lib/data/business'
import { getAgentsForOrg } from '@/lib/data/agents'
import { BookingPagePublicClient } from './booking-page-public-client'

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const org = await getOrganizationBySlug(slug)
  if (!org) notFound()

  const [settings, services, agents] = await Promise.all([
    getOrganizationSettings(org.id),
    getServices(org.id),
    getAgentsForOrg(org.id),
  ])

  if (!settings.bookingPageEnabled) notFound()

  const agent = agents[0] ?? null

  return (
    <BookingPagePublicClient
      organizationId={org.id}
      organizationName={org.name}
      services={services.filter((s) => s.showOnBookingPage)}
      agentId={agent?.id ?? null}
      agentName={agent ? (agent.business_name ?? agent.name) : org.name}
    />
  )
}
