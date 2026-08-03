import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type DaySlots = { date: string; slots: { startsAt: string; endsAt: string }[] }

type BusinessHoursRow = {
  day_of_week: number
  is_open: boolean
  start_time: string | null
  end_time: string | null
}

type BusinessProfileRow = {
  timezone: string
  booking_slot_interval_minutes: number
  advance_booking_window_days: number
  minimum_booking_notice_minutes: number
}

type ExceptionRow = {
  type: 'closed' | 'custom_hours'
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
}

type TimeOffRow = {
  staff_id: string | null
  scope: string
  all_day: boolean
  starts_at: string
  ends_at: string
}

type AppointmentRow = { staff_id: string | null; status: string; starts_at: string; ends_at: string }

function enumerateDates(rangeStart: string, rangeEnd: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${rangeStart}T00:00:00.000Z`)
  const end = new Date(`${rangeEnd}T00:00:00.000Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function dayOfWeekFor(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
}

function chunkIntoSlots(
  date: string,
  openStart: string,
  openEnd: string,
  intervalMinutes: number,
  durationMinutes: number
): { startsAt: string; endsAt: string }[] {
  const slots: { startsAt: string; endsAt: string }[] = []
  let cursor = new Date(`${date}T${openStart}.000Z`)
  const closeTime = new Date(`${date}T${openEnd}.000Z`)

  while (true) {
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000)
    if (slotEnd > closeTime) break
    slots.push({ startsAt: cursor.toISOString(), endsAt: slotEnd.toISOString() })
    cursor = new Date(cursor.getTime() + intervalMinutes * 60_000)
  }

  return slots
}

function subtractInterval(
  slots: { startsAt: string; endsAt: string }[],
  blockStart: string,
  blockEnd: string
): { startsAt: string; endsAt: string }[] {
  const blockStartMs = new Date(blockStart).getTime()
  const blockEndMs = new Date(blockEnd).getTime()
  return slots.filter((slot) => {
    const slotStartMs = new Date(slot.startsAt).getTime()
    const slotEndMs = new Date(slot.endsAt).getTime()
    return slotEndMs <= blockStartMs || slotStartMs >= blockEndMs
  })
}

export async function getAvailableSlots(
  organizationId: string,
  input: {
    serviceId: string
    staffId?: string | null
    rangeStart: string
    rangeEnd: string
  }
): Promise<DaySlots[]> {
  const supabase = createServiceRoleClient()

  const [
    { data: profile },
    { data: serviceRow },
    { data: hoursRows },
    { data: staffHoursRows },
    { data: exceptionRows },
    { data: timeOffRows },
    { data: appointmentRows },
  ] = await Promise.all([
    supabase
      .from('business_profile')
      .select(
        'timezone, booking_slot_interval_minutes, advance_booking_window_days, minimum_booking_notice_minutes'
      )
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase.from('services').select('duration_minutes').eq('id', input.serviceId).maybeSingle(),
    supabase
      .from('business_hours')
      .select('day_of_week, is_open, start_time, end_time')
      .eq('organization_id', organizationId),
    input.staffId
      ? supabase
          .from('staff_hours')
          .select('day_of_week, is_open, start_time, end_time')
          .eq('staff_id', input.staffId)
      : Promise.resolve({ data: [] as BusinessHoursRow[] }),
    supabase
      .from('availability_exceptions')
      .select('type, start_date, end_date, start_time, end_time')
      .eq('organization_id', organizationId)
      .lte('start_date', input.rangeEnd)
      .gte('end_date', input.rangeStart),
    supabase
      .from('time_off')
      .select('staff_id, scope, all_day, starts_at, ends_at')
      .eq('organization_id', organizationId)
      .lt('starts_at', `${input.rangeEnd}T23:59:59.999Z`)
      .gt('ends_at', `${input.rangeStart}T00:00:00.000Z`),
    supabase
      .from('appointments')
      .select('staff_id, status, starts_at, ends_at')
      .eq('organization_id', organizationId)
      .neq('status', 'cancelled')
      .lt('starts_at', `${input.rangeEnd}T23:59:59.999Z`)
      .gt('ends_at', `${input.rangeStart}T00:00:00.000Z`),
  ])

  const businessProfile = (profile ?? {
    timezone: 'UTC',
    booking_slot_interval_minutes: 30,
    advance_booking_window_days: 14,
    minimum_booking_notice_minutes: 0,
  }) as BusinessProfileRow
  const durationMinutes = (serviceRow as { duration_minutes: number } | null)?.duration_minutes ?? 30

  const hoursByDay = new Map<number, BusinessHoursRow>(
    ((hoursRows ?? []) as BusinessHoursRow[]).map((row) => [row.day_of_week, row])
  )
  const staffHoursByDay = new Map<number, BusinessHoursRow>(
    ((staffHoursRows ?? []) as BusinessHoursRow[]).map((row) => [row.day_of_week, row])
  )

  const dates = enumerateDates(input.rangeStart, input.rangeEnd)

  return dates.map((date) => {
    const dow = dayOfWeekFor(date)
    const override = staffHoursByDay.get(dow)
    const hours = override ?? hoursByDay.get(dow)

    if (!hours || !hours.is_open || !hours.start_time || !hours.end_time) {
      return { date, slots: [] }
    }

    const closedByException = ((exceptionRows ?? []) as ExceptionRow[]).some(
      (ex) => ex.type === 'closed' && date >= ex.start_date && date <= ex.end_date
    )
    if (closedByException) {
      return { date, slots: [] }
    }

    let slots = chunkIntoSlots(
      date,
      hours.start_time,
      hours.end_time,
      businessProfile.booking_slot_interval_minutes,
      durationMinutes
    )

    const relevantTimeOff = ((timeOffRows ?? []) as TimeOffRow[]).filter(
      (block) => block.scope === 'company' || (block.scope === 'staff' && block.staff_id === input.staffId)
    )
    for (const block of relevantTimeOff) {
      slots = subtractInterval(slots, block.starts_at, block.ends_at)
    }

    const relevantAppointments = ((appointmentRows ?? []) as AppointmentRow[]).filter(
      (appt) => !input.staffId || appt.staff_id === input.staffId || appt.staff_id === null
    )
    for (const appt of relevantAppointments) {
      slots = subtractInterval(slots, appt.starts_at, appt.ends_at)
    }

    const now = Date.now()
    const windowCutoffMs = now + businessProfile.advance_booking_window_days * 86_400_000
    const noticeCutoffMs = now + businessProfile.minimum_booking_notice_minutes * 60_000
    const dateStartMs = new Date(`${date}T00:00:00.000Z`).getTime()
    if (dateStartMs > windowCutoffMs) {
      return { date, slots: [] }
    }
    slots = slots.filter((slot) => new Date(slot.startsAt).getTime() >= noticeCutoffMs)

    return { date, slots }
  })
}

export type BookingPageStaff = { id: string; name: string }

export async function getStaffForBookingPage(organizationId: string): Promise<BookingPageStaff[]> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('staff_members')
    .select('id, full_name, display_name')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('show_on_booking_page', true)

  return ((data ?? []) as { id: string; full_name: string; display_name: string | null }[]).map((row) => ({
    id: row.id,
    name: row.display_name ?? row.full_name,
  }))
}
