import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg } from '@/lib/data/agents'
import { getBusinessProfile } from '@/lib/data/business'
import { getOverviewMetrics, getCallStats, getDateRange } from '@/lib/data/analytics'
import { getConversationsForOrg } from '@/lib/data/conversations'
import { getAppointmentsForRange } from '@/lib/data/calendar'
import { HomeClient } from './home-client'

export default async function HomePage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const agents = await getAgentsForOrg(context.org.id)
  const { startDate, endDate } = getDateRange('7d')

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [overview, callStats, conversations, upcomingAppointments, businessProfile] =
    await Promise.all([
      getOverviewMetrics(context.org.id, startDate, endDate),
      getCallStats(context.org.id, startDate, endDate),
      getConversationsForOrg(),
      getAppointmentsForRange(context.org.id, now.toISOString(), in7Days.toISOString()),
      getBusinessProfile(context.org.id),
    ])

  const agent = agents.find((a) => a.is_default) ?? agents[0] ?? null
  const businessName = businessProfile.businessName ?? agent?.business_name ?? agent?.name ?? null

  return (
    <HomeClient
      agent={agent}
      businessName={businessName}
      metrics={{
        calls: callStats.totalCalls,
        bookings: overview.bookings,
        revenue: overview.revenue,
        newClients: overview.newClients,
      }}
      latestCalls={conversations.slice(0, 5)}
      upcomingAppointments={upcomingAppointments
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .slice(0, 5)}
    />
  )
}
