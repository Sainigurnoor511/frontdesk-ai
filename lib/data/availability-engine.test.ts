import { describe, it, expect, vi } from 'vitest'
import { getAvailableSlots } from './availability-engine'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

function mockSupabase(tables: Record<string, unknown[]>) {
  function chain(table: string): unknown {
    const result = Promise.resolve({ data: tables[table] ?? [], error: null })
    const node: Record<string, unknown> = {
      eq: () => chain(table),
      lt: () => chain(table),
      gt: () => chain(table),
      lte: () => chain(table),
      gte: () => chain(table),
      neq: () => chain(table),
      order: () => chain(table),
      maybeSingle: () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        result.then(resolve, reject),
    }
    return node
  }

  return {
    from: (table: string) => ({
      select: () => chain(table),
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
