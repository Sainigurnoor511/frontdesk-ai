'use server'

import { getCurrentOrgAndUser } from '@/lib/data/organization'
import {
  getOverviewMetrics,
  getCallStats,
  getCallVolumeByDay,
  getConversionRate,
  getClientStats,
  getDateRange,
  type OverviewMetrics,
  type CallStats,
  type CallVolumeDay,
  type DateRangeOption,
} from '@/lib/data/analytics'

export type { DateRangeOption } from '@/lib/data/analytics'

export type AnalyticsData = {
  overview: OverviewMetrics
  callStats: CallStats
  callVolume: CallVolumeDay[]
  conversionRate: number
  clientStats: { totalClients: number; newClients: number }
}

export async function getAnalyticsForRange(
  range: DateRangeOption
): Promise<AnalyticsData | { error: string }> {
  const context = await getCurrentOrgAndUser()
  if (!context) {
    return { error: 'You must be signed in to view analytics.' }
  }

  const { startDate, endDate } = getDateRange(range)

  const [overview, callStats, callVolume, conversionRate, clientStats] = await Promise.all([
    getOverviewMetrics(context.org.id, startDate, endDate),
    getCallStats(context.org.id, startDate, endDate),
    getCallVolumeByDay(context.org.id, startDate, endDate),
    getConversionRate(context.org.id, startDate, endDate),
    getClientStats(context.org.id, startDate, endDate),
  ])

  return { overview, callStats, callVolume, conversionRate, clientStats }
}
