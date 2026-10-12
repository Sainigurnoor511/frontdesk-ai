import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAvailableSlots } from './availability-engine'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

/**
 * Every fixture below is dated around 2026-08-10, and the engine filters slots
 * against the real clock through `minimum_booking_notice_minutes` and
 * `advance_booking_window_days`. Once that date passed, six of these started
 * asserting against empty slot lists and were written off as "date/timezone
 * fixtures" in the known-issues list. Pinning the clock relative to the
 * fixtures is what makes them assert the engine's behaviour again instead of
 * the calendar's. Tests that set their own system time still override this.
 */
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-09T08:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * `errors` models the real supabase-js contract: a query error **resolves** with
 * `{ data: null, error }`, it does not reject. That distinction is the whole
 * point of the fail-closed tests at the bottom of this file — a `mockRejected`
 * stand-in would pass even with the error field ignored.
 */
function mockSupabase(
  tables: Record<string, unknown[]>,
  errors: Record<string, { message: string }> = {}
) {
  function chain(table: string, rows: unknown[]): unknown {
    const error = errors[table] ?? null
    const data = error ? null : rows
    const result = Promise.resolve({ data, error })
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
      maybeSingle: () => Promise.resolve({ data: error ? null : rows[0] ?? null, error }),
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

describe('getAvailableSlots — staff scoping and service duration', () => {
  function tables(options: {
    appointments?: unknown[]
    services?: unknown[]
    staffHours?: unknown[]
    timeOff?: unknown[]
  }) {
    return {
      business_profile: [
        {
          organization_id: 'org-1',
          timezone: 'UTC',
          booking_slot_interval_minutes: 30,
          advance_booking_window_days: 14,
          minimum_booking_notice_minutes: 0,
        },
      ],
      services: options.services ?? [{ id: 'svc-1', duration_minutes: 30 }],
      business_hours: [
        { organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '11:00:00' },
      ],
      staff_hours: options.staffHours ?? [],
      availability_exceptions: [],
      time_off: options.timeOff ?? [],
      appointments: options.appointments ?? [],
    }
  }

  async function use(t: Record<string, unknown[]>) {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase(t) as never)
  }

  // Issue 2 of the review, engine side: when `staffId` is passed, another staff
  // member's appointments must not block the slot. The voice reschedule tool
  // used to omit `staffId` entirely, which produced exactly this wrong answer.
  it('ignores another staff member\'s appointment when a staff member is selected', async () => {
    await use(
      tables({
        appointments: [
          { id: 'other', staff_id: 'staff-2', status: 'confirmed', starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
        ],
      })
    )

    const forStaffOne = await getAvailableSlots('org-1', {
      serviceId: 'svc-1',
      staffId: 'staff-1',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
    })
    expect(forStaffOne[0].slots.map((slot) => slot.startsAt)).toContain('2026-08-10T09:00:00.000Z')

    // With no staff selected the same appointment blocks org-wide.
    const orgWide = await getAvailableSlots('org-1', {
      serviceId: 'svc-1',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
    })
    expect(orgWide[0].slots.map((slot) => slot.startsAt)).not.toContain('2026-08-10T09:00:00.000Z')
  })

  it('blocks the selected staff member\'s own appointment and unassigned ones', async () => {
    await use(
      tables({
        appointments: [
          { id: 'theirs', staff_id: 'staff-1', status: 'confirmed', starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
          { id: 'nobody', staff_id: null, status: 'confirmed', starts_at: '2026-08-10T10:00:00.000Z', ends_at: '2026-08-10T10:30:00.000Z' },
        ],
      })
    )

    const result = await getAvailableSlots('org-1', {
      serviceId: 'svc-1',
      staffId: 'staff-1',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
    })

    expect(result[0].slots.map((slot) => slot.startsAt)).toEqual([
      '2026-08-10T09:30:00.000Z',
      '2026-08-10T10:30:00.000Z',
    ])
  })

  it('keeps the selected staff member out of their own approved time off', async () => {
    await use(
      tables({
        timeOff: [
          { organization_id: 'org-1', staff_id: 'staff-1', scope: 'staff', all_day: false, starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T10:00:00.000Z' },
        ],
      })
    )

    const result = await getAvailableSlots('org-1', {
      serviceId: 'svc-1',
      staffId: 'staff-1',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
    })

    expect(result[0].slots.map((slot) => slot.startsAt)).toEqual([
      '2026-08-10T10:00:00.000Z',
      '2026-08-10T10:30:00.000Z',
    ])
  })

  it('generates slots at the service duration, not a synthetic 30 minutes', async () => {
    await use(tables({ services: [{ id: 'svc-1', duration_minutes: 45 }] }))

    const result = await getAvailableSlots('org-1', {
      serviceId: 'svc-1',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
    })

    // 09:00–11:00 at a 30-minute interval, each slot 45 minutes long.
    expect(result[0].slots).toEqual([
      { startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:45:00.000Z' },
      { startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:15:00.000Z' },
      { startsAt: '2026-08-10T10:00:00.000Z', endsAt: '2026-08-10T10:45:00.000Z' },
    ])
  })

  it('falls back to 30 minutes when no service is given', async () => {
    await use(tables({}))

    const result = await getAvailableSlots('org-1', {
      serviceId: '',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
    })

    expect(result[0].slots[0]).toEqual({
      startsAt: '2026-08-10T09:00:00.000Z',
      endsAt: '2026-08-10T09:30:00.000Z',
    })
  })

  // `excludeAppointmentId` had no engine-level coverage at all. It is what lets
  // an appointment be moved within its own footprint instead of blocking itself.
  it('treats the excluded appointment as if it did not exist', async () => {
    const appointments = [
      { id: 'appt-1', staff_id: null, status: 'confirmed', starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
    ]
    await use(tables({ appointments }))

    const blocking = await getAvailableSlots('org-1', {
      serviceId: 'svc-1',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
    })
    expect(blocking[0].slots.map((slot) => slot.startsAt)).not.toContain('2026-08-10T09:00:00.000Z')

    const excluded = await getAvailableSlots('org-1', {
      serviceId: 'svc-1',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
      excludeAppointmentId: 'appt-1',
    })
    expect(excluded[0].slots.map((slot) => slot.startsAt)).toContain('2026-08-10T09:00:00.000Z')
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

describe('getAvailableSlots — fails closed on a read error', () => {
  const OPEN_TABLES = {
    business_profile: [
      {
        id: 'bp-1',
        organization_id: 'org-1',
        timezone: 'UTC',
        booking_slot_interval_minutes: 30,
        advance_booking_window_days: 14,
        minimum_booking_notice_minutes: 0,
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
  }

  async function withError(table: string) {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase(OPEN_TABLES, { [table]: { message: 'boom' } }) as never
    )
  }

  // Each of these reads *removes* a constraint when it comes back empty, so
  // ignoring `error` would hand the caller a slot list that looks freer than
  // reality — and the reschedule tool would report a move it had no basis for.
  for (const table of [
    'appointments',
    'time_off',
    'availability_exceptions',
    'staff_hours',
    'business_hours',
    'business_profile',
    'services',
  ]) {
    it(`throws rather than dropping blockers when the ${table} read errors`, async () => {
      await withError(table)

      await expect(
        getAvailableSlots('org-1', {
          serviceId: 'svc-1',
          staffId: 'staff-1',
          rangeStart: '2026-08-10',
          rangeEnd: '2026-08-10',
        })
      ).rejects.toThrow(new RegExp(`availability read failed \\(${table}\\)`))
    })
  }

  it('skips the services read entirely when no service is given, instead of querying id = ""', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const select = vi.fn()
    const client = mockSupabase(OPEN_TABLES)
    vi.mocked(createServiceRoleClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'services') return { select }
        return client.from(table)
      },
    } as never)

    await getAvailableSlots('org-1', {
      serviceId: '',
      rangeStart: '2026-08-10',
      rangeEnd: '2026-08-10',
    })

    // `services.id` is a uuid column, so `.eq('id', '')` is a Postgres cast
    // error — which, now that errors throw, would break every service-less
    // caller (the voice reschedule tool, the public reschedule action).
    expect(select).not.toHaveBeenCalled()
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
