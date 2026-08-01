import { createClient } from '@/lib/supabase/server'

export type DateRangeOption = '7d' | '30d' | '90d'

const RANGE_DAYS: Record<DateRangeOption, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export function getDateRange(option: DateRangeOption) {
  const days = RANGE_DAYS[option] ?? 7
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return { startDate: start.toISOString(), endDate: end.toISOString() }
}

export type OverviewMetrics = {
  // TODO: revenue tracking is not wired up yet — there is no pricing-per-booking
  // or payments table. This is genuinely $0, not a placeholder for a missing query.
  revenue: number
  bookings: number
  newClients: number
  cancellations: number
}

export type CallStats = {
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  averageDurationSeconds: number
}

export type CallVolumeDay = {
  date: string
  count: number
}

export async function getOverviewMetrics(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<OverviewMetrics> {
  const supabase = await createClient()

  const [bookingsResult, newClientsResult, cancellationsResult] = await Promise.all([
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'confirmed')
      .gte('starts_at', startDate)
      .lte('starts_at', endDate),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', startDate)
      .lte('created_at', endDate),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'cancelled')
      .gte('starts_at', startDate)
      .lte('starts_at', endDate),
  ])

  return {
    revenue: 0,
    bookings: bookingsResult.count ?? 0,
    newClients: newClientsResult.count ?? 0,
    cancellations: cancellationsResult.count ?? 0,
  }
}

export async function getCallStats(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<CallStats> {
  const supabase = await createClient()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('outcome, duration_seconds')
    .eq('organization_id', organizationId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  const rows = conversations ?? []
  const totalCalls = rows.length
  const successfulCalls = rows.filter((row) => row.outcome === 'successful').length
  const failedCalls = rows.filter((row) => row.outcome === 'failed').length
  const totalDuration = rows.reduce((sum, row) => sum + (row.duration_seconds ?? 0), 0)
  const averageDurationSeconds = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0

  return {
    totalCalls,
    successfulCalls,
    failedCalls,
    averageDurationSeconds,
  }
}

export async function getCallVolumeByDay(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<CallVolumeDay[]> {
  const supabase = await createClient()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  const rows = conversations ?? []

  const countsByDay = new Map<string, number>()
  for (const row of rows) {
    const day = row.created_at.slice(0, 10) // YYYY-MM-DD
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1)
  }

  // Fill in every day in the range, including days with zero calls, for an honest flat state.
  // Work with UTC day boundaries throughout so the day strings match what we sliced
  // from `created_at` (an ISO timestamp) above, regardless of server timezone.
  const result: CallVolumeDay[] = []
  const startDay = startDate.slice(0, 10)
  const endDay = endDate.slice(0, 10)
  const cursor = new Date(`${startDay}T00:00:00.000Z`)
  const end = new Date(`${endDay}T00:00:00.000Z`)

  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10)
    result.push({ date: day, count: countsByDay.get(day) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return result
}

export async function getConversionRate(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const supabase = await createClient()

  const [callsResult, bookingsResult] = await Promise.all([
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', startDate)
      .lte('created_at', endDate),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'confirmed')
      .gte('starts_at', startDate)
      .lte('starts_at', endDate),
  ])

  const totalCalls = callsResult.count ?? 0
  const totalBookings = bookingsResult.count ?? 0

  if (totalCalls === 0) return 0

  return (totalBookings / totalCalls) * 100
}

export async function getClientStats(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<{ totalClients: number; newClients: number }> {
  const supabase = await createClient()

  const [totalResult, newResult] = await Promise.all([
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', startDate)
      .lte('created_at', endDate),
  ])

  return {
    totalClients: totalResult.count ?? 0,
    newClients: newResult.count ?? 0,
  }
}
