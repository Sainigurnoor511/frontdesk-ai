import { describe, it, expect, vi } from 'vitest'
import { getAvailableSlots } from './availability-engine'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

function mockSupabase(tables: Record<string, unknown[]>) {
  function chain(table: string, rows: unknown[]): unknown {
    const result = Promise.resolve({ data: rows, error: null })
    const node: Record<string, unknown> = {
      eq: () => chain(table, rows),
      lt: () => chain(table, rows),
      gt: () => chain(table, rows),
      lte: () => chain(table, rows),
      gte: () => chain(table, rows),
      neq: (column: string, value: unknown) =>
        chain(
          table,
          rows.filter((row) => (row as Record<string, unknown>)[column] !== value)
        ),
      order: () => chain(table, rows),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        result.then(resolve, reject),
    }
    return node
  }

  return {
    from: (table: string) => ({
      select: () => chain(table, tables[table] ?? []),
    }),
  }
}

describe('getAvailableSlots — business hours only', () => {
  it('generates 30-minute slots within a single open day, fitting the service duration', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          {
            id: 'bp-1',
            organization_id: 'org-1',
            timezone: 'UTC',
            booking_slot_interval_minutes: 30,
            advance_booking_window_days: 14,
            minimum_booking_notice_minutes: 0,
            limit_overlapping_appointments: false,
          },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [
          { organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' },
        ],
        staff_hours: [],
        availability_exceptions: [],
        time_off: [],
        appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', {
      serviceId: 'svc-1',
      rangeStart: '2026-08-10', // a Monday
      rangeEnd: '2026-08-10',
    })

    expect(result).toEqual([
      {
        date: '2026-08-10',
        slots: [
          { startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' },
          { startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' },
        ],
      },
    ])
  })

  it('returns no slots for a day the org is closed', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          {
            id: 'bp-1', organization_id: 'org-1', timezone: 'UTC',
            booking_slot_interval_minutes: 30, advance_booking_window_days: 14,
            minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false,
          },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [
          { organization_id: 'org-1', day_of_week: 1, is_open: false, start_time: null, end_time: null },
        ],
        staff_hours: [], availability_exceptions: [], time_off: [], appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', {
      serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10',
    })

    expect(result).toEqual([{ date: '2026-08-10', slots: [] }])
  })

  it('prefers a staff-hours override over business hours when staffId is given', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          {
            id: 'bp-1', organization_id: 'org-1', timezone: 'UTC',
            booking_slot_interval_minutes: 60, advance_booking_window_days: 14,
            minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false,
          },
        ],
        services: [{ id: 'svc-1', duration_minutes: 60 }],
        business_hours: [
          { organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '17:00:00' },
        ],
        staff_hours: [
          { staff_id: 'staff-1', day_of_week: 1, is_open: true, start_time: '12:00:00', end_time: '13:00:00' },
        ],
        availability_exceptions: [], time_off: [], appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', {
      serviceId: 'svc-1', staffId: 'staff-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10',
    })

    expect(result).toEqual([
      {
        date: '2026-08-10',
        slots: [{ startsAt: '2026-08-10T12:00:00.000Z', endsAt: '2026-08-10T13:00:00.000Z' }],
      },
    ])
  })
})

describe('getAvailableSlots — exceptions and time off', () => {
  it('excludes a day fully closed by an availability exception', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          { id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [],
        availability_exceptions: [
          { organization_id: 'org-1', type: 'closed', start_date: '2026-08-10', end_date: '2026-08-10', start_time: null, end_time: null },
        ],
        time_off: [], appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(result).toEqual([{ date: '2026-08-10', slots: [] }])
  })

  it('excludes slots covered by org-wide time off regardless of staff selection', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          { id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [], availability_exceptions: [],
        time_off: [
          { organization_id: 'org-1', staff_id: null, scope: 'company', all_day: false, starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
        ],
        appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(result).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' }] }])
  })

  it('excludes slots covered by staff-scoped time off only when that staff is selected', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          { id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [], availability_exceptions: [],
        time_off: [
          { organization_id: 'org-1', staff_id: 'staff-1', scope: 'staff', all_day: false, starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
        ],
        appointments: [],
      }) as never
    )

    const withStaff = await getAvailableSlots('org-1', { serviceId: 'svc-1', staffId: 'staff-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(withStaff).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' }] }])

    const withoutStaff = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(withoutStaff).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }, { startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' }] }])
  })
})

describe('getAvailableSlots — appointments, advance window, minimum notice', () => {
  it('excludes a slot already booked by an existing appointment, org-wide when no staff selected', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [{ id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false }],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [], availability_exceptions: [], time_off: [],
        appointments: [
          { organization_id: 'org-1', staff_id: null, status: 'confirmed', starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
        ],
      }) as never
    )

    const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(result).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' }] }])
  })

  it('ignores cancelled appointments', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [{ id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false }],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '09:30:00' }],
        staff_hours: [], availability_exceptions: [], time_off: [],
        appointments: [
          { organization_id: 'org-1', staff_id: null, status: 'cancelled', starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
        ],
      }) as never
    )

    const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(result).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }] }])
  })

  it('drops dates beyond the advance booking window', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [{ id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 1, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false }],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [], availability_exceptions: [], time_off: [], appointments: [],
      }) as never
    )

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T00:00:00.000Z'))
    try {
      const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-09', rangeEnd: '2026-08-11' })
      expect(result.find((d) => d.date === '2026-08-11')?.slots).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops slots starting sooner than the minimum booking notice', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [{ id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 120, limit_overlapping_appointments: false }],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '12:00:00' }],
        staff_hours: [], availability_exceptions: [], time_off: [], appointments: [],
      }) as never
    )

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T09:00:00.000Z'))
    try {
      const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
      expect(result[0].slots.every((s) => new Date(s.startsAt).getTime() >= new Date('2026-08-10T11:00:00.000Z').getTime())).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('getStaffForBookingPage', () => {
  it('returns only active staff opted into the booking page, using display name when set', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        staff_members: [
          { id: 'staff-1', full_name: 'Ada Lovelace', display_name: null },
          { id: 'staff-2', full_name: 'Grace Hopper', display_name: 'Coach Grace' },
        ],
      }) as never
    )

    const { getStaffForBookingPage } = await import('./availability-engine')
    const result = await getStaffForBookingPage('org-1')

    expect(result).toEqual([
      { id: 'staff-1', name: 'Ada Lovelace' },
      { id: 'staff-2', name: 'Coach Grace' },
    ])
  })
})
