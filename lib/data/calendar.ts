import { createClient } from '@/lib/supabase/server'

export type AppointmentRow = {
  id: string
  organization_id: string
  agent_id: string | null
  title: string
  client_name: string
  client_phone: string | null
  starts_at: string
  ends_at: string
  notes: string | null
  internal_notes: string | null
  status: string
  created_at: string
  updated_at: string
}

export type TimeOffRow = {
  id: string
  organization_id: string
  scope: string
  name: string
  all_day: boolean
  starts_at: string
  ends_at: string
  reason: string | null
  created_at: string
}

export async function getAppointmentsForRange(
  orgId: string,
  startsAt: string,
  endsAt: string
): Promise<AppointmentRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('organization_id', orgId)
    .neq('status', 'cancelled')
    .gte('starts_at', startsAt)
    .lte('starts_at', endsAt)

  if (error || !data) return []

  return data
}

export async function getTimeOffForRange(
  orgId: string,
  startsAt: string,
  endsAt: string
): Promise<TimeOffRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('time_off')
    .select('*')
    .eq('organization_id', orgId)
    .gte('starts_at', startsAt)
    .lte('starts_at', endsAt)

  if (error || !data) return []

  return data
}
