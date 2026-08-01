import { createClient } from '@/lib/supabase/server'

export type BusinessHoursRow = {
  id: string | null
  organization_id: string
  day_of_week: number
  is_open: boolean
  start_time: string | null
  end_time: string | null
}

export type ExceptionRow = {
  id: string
  organization_id: string
  name: string
  type: 'closed' | 'custom_hours'
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
  created_at: string
}

function defaultBusinessHours(orgId: string): BusinessHoursRow[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    id: null,
    organization_id: orgId,
    day_of_week: dayOfWeek,
    is_open: true,
    start_time: '09:00:00',
    end_time: '17:00:00',
  }))
}

export async function getBusinessHours(orgId: string): Promise<BusinessHoursRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('business_hours')
    .select('id, organization_id, day_of_week, is_open, start_time, end_time')
    .eq('organization_id', orgId)
    .order('day_of_week', { ascending: true })

  if (error || !data || data.length === 0) {
    return defaultBusinessHours(orgId)
  }

  // Fill in any missing days with sensible defaults so the UI always has 7 rows.
  const byDay = new Map(data.map((row) => [row.day_of_week, row]))
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const existing = byDay.get(dayOfWeek)
    if (existing) return existing
    return {
      id: null,
      organization_id: orgId,
      day_of_week: dayOfWeek,
      is_open: true,
      start_time: '09:00:00',
      end_time: '17:00:00',
    }
  })
}

export async function getUpcomingExceptions(orgId: string): Promise<ExceptionRow[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('availability_exceptions')
    .select('*')
    .eq('organization_id', orgId)
    .gte('end_date', today)
    .order('start_date', { ascending: true })

  if (error || !data) {
    return []
  }

  return data
}
