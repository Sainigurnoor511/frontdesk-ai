import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getServices, getLocations } from '@/lib/data/business'
import { getStaffForOrg } from '@/lib/data/staff'
import {
  getOverviewMetrics,
  getCallStats,
  getCallVolumeByDay,
  getConversionRate,
  getClientStats,
  getBookingCountsByService,
  getBookingCountsByStaff,
  getDateRange,
} from '@/lib/data/analytics'
import { AnalyticsClient } from './analytics-client'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const { startDate, endDate } = getDateRange('7d')

  const [overview, callStats, callVolume, conversionRate, clientStats, bookingCountsByService, bookingCountsByStaff, services, staff, locations] =
    await Promise.all([
      getOverviewMetrics(context.org.id, startDate, endDate),
      getCallStats(context.org.id, startDate, endDate),
      getCallVolumeByDay(context.org.id, startDate, endDate),
      getConversionRate(context.org.id, startDate, endDate),
      getClientStats(context.org.id, startDate, endDate),
      getBookingCountsByService(context.org.id, startDate, endDate),
      getBookingCountsByStaff(context.org.id, startDate, endDate),
      getServices(context.org.id),
      getStaffForOrg(),
      getLocations(context.org.id),
    ])

  const { tab } = await searchParams

  return (
    <AnalyticsClient
      initialRange="7d"
      initialTab={tab}
      initialData={{
        overview,
        callStats,
        callVolume,
        conversionRate,
        clientStats,
        bookingCountsByService,
        bookingCountsByStaff,
      }}
      services={services}
      staff={staff}
      locations={locations}
    />
  )
}
