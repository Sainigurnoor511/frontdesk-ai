'use server'

import { getCurrentOrgAndUser } from '@/lib/data/organization'
import {
  getOverviewMetrics,
  getCallStats,
  getCallVolumeByDay,
  getConversionRate,
  getClientStats,
  getBookingCountsByService,
  getBookingCountsByStaff,
  getDateRange,
  type OverviewMetrics,
  type CallStats,
  type CallVolumeDay,
  type DateRangeOption,
  type ConversationChannel,
} from '@/lib/data/analytics'

export type { DateRangeOption } from '@/lib/data/analytics'

export type AnalyticsChannel = ConversationChannel | 'all'

export type AnalyticsData = {
  overview: OverviewMetrics
  callStats: CallStats
  callVolume: CallVolumeDay[]
  conversionRate: number
  clientStats: { totalClients: number; newClients: number }
  bookingCountsByService: Record<string, number>
  bookingCountsByStaff: Record<string, number>
}

export async function getAnalyticsForRange(
  range: DateRangeOption,
  channel: AnalyticsChannel = 'all'
): Promise<AnalyticsData | { error: string }> {
  const context = await getCurrentOrgAndUser()
  if (!context) {
    return { error: 'You must be signed in to view analytics.' }
  }

  const { startDate, endDate } = getDateRange(range)
  const channelFilter = channel === 'all' ? undefined : channel

  const [
    overview,
    callStats,
    callVolume,
    conversionRate,
    clientStats,
    bookingCountsByService,
    bookingCountsByStaff,
  ] = await Promise.all([
    getOverviewMetrics(context.org.id, startDate, endDate),
    getCallStats(context.org.id, startDate, endDate, channelFilter),
    getCallVolumeByDay(context.org.id, startDate, endDate, channelFilter),
    getConversionRate(context.org.id, startDate, endDate),
    getClientStats(context.org.id, startDate, endDate),
    getBookingCountsByService(context.org.id, startDate, endDate),
    getBookingCountsByStaff(context.org.id, startDate, endDate),
  ])

  return {
    overview,
    callStats,
    callVolume,
    conversionRate,
    clientStats,
    bookingCountsByService,
    bookingCountsByStaff,
  }
}
