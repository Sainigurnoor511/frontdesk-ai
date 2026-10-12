import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The reschedule tool wired to the **real** availability engine, with only the
 * Supabase client and the write path mocked.
 *
 * `manage-booking-handlers.test.ts` mocks `getAvailableSlots` outright, which is
 * right for the conversational branches but cannot see the bug these tests are
 * about: supabase-js *resolves* with `{ data: null, error }` on a query error
 * instead of rejecting, so an engine that reads only `data` turns a failed
 * appointments or time-off read into "nothing blocks that time" — and the tool
 * writes the move and tells the caller it is confirmed. A `mockRejectedValue()`
 * test passes either way, because it only exercises error *mapping*.
 *
 * So these assert the end-to-end contract: resolved error in, no mutation out.
 */
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/data/booking-service', () => ({
  findClientAppointmentsByEmailServiceRole: vi.fn(),
  cancelAppointmentByEmailServiceRole: vi.fn(),
  rescheduleAppointmentByEmailServiceRole: vi.fn(),
}))

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  findClientAppointmentsByEmailServiceRole,
  rescheduleAppointmentByEmailServiceRole,
  type AppointmentRow,
} from '@/lib/data/booking-service'
import { buildManageBookingToolHandlers } from './manage-booking-handlers'

const NOW = new Date('2026-08-03T12:00:00Z')
const EMAIL = 'ada@example.com'

const CONTEXT = {
  organizationId: 'org-1',
  agentId: 'agent-1',
  conversationId: 'conv-1',
}

/** Thursday 2026-08-06, 09:00–17:00, nothing else booked. */
const OPEN_TABLES: Record<string, unknown[]> = {
  business_profile: [
    {
      organization_id: 'org-1',
      timezone: 'UTC',
      booking_slot_interval_minutes: 30,
      advance_booking_window_days: 14,
      minimum_booking_notice_minutes: 0,
    },
  ],
  services: [],
  business_hours: [
    { organization_id: 'org-1', day_of_week: 4, is_open: true, start_time: '09:00:00', end_time: '17:00:00' },
  ],
  staff_hours: [],
  availability_exceptions: [],
  time_off: [],
  appointments: [],
}

function mockSupabase(errors: Record<string, { message: string }> = {}) {
  function chain(table: string, rows: unknown[]): unknown {
    const error = errors[table] ?? null
    const data = error ? null : rows
    const settled = Promise.resolve({ data, error })
    const node: Record<string, unknown> = {
      eq: () => chain(table, rows),
      neq: () => chain(table, rows),
      lt: () => chain(table, rows),
      gt: () => chain(table, rows),
      lte: () => chain(table, rows),
      gte: () => chain(table, rows),
      order: () => chain(table, rows),
      maybeSingle: () => Promise.resolve({ data: error ? null : rows[0] ?? null, error }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        settled.then(resolve, reject),
    }
    return node
  }

  return {
    from: (table: string) => ({ select: () => chain(table, OPEN_TABLES[table] ?? []) }),
  }
}

const APPOINTMENT: AppointmentRow = {
  id: 'appt-1',
  organization_id: 'org-1',
  agent_id: 'agent-1',
  title: 'Haircut',
  client_name: 'Ada Lovelace',
  client_phone: null,
  client_id: 'client-1',
  conversation_id: null,
  service_id: null,
  staff_id: null,
  starts_at: '2026-08-05T14:00:00+00:00',
  ends_at: '2026-08-05T14:30:00+00:00',
  notes: null,
  internal_notes: null,
  status: 'confirmed',
  created_at: '2026-08-01T00:00:00+00:00',
  updated_at: '2026-08-01T00:00:00+00:00',
}

const ARGS = {
  clientEmail: EMAIL,
  startsAt: '2026-08-05T14:00:00Z',
  newStartsAt: '2026-08-06T09:00:00Z',
}

function reschedule() {
  const handler = buildManageBookingToolHandlers(CONTEXT).find(
    (entry) => entry.name === 'reschedule_appointment'
  )
  if (!handler) throw new Error('no reschedule_appointment tool')
  return handler
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([APPOINTMENT])
  vi.mocked(rescheduleAppointmentByEmailServiceRole).mockResolvedValue({ success: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('reschedule_appointment against the real availability engine', () => {
  it('moves the appointment when every read succeeds (control)', async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase() as never)

    const result = (await reschedule().execute(ARGS)) as { success?: true }

    expect(result.success).toBe(true)
    expect(rescheduleAppointmentByEmailServiceRole).toHaveBeenCalledTimes(1)
  })

  // Each of these is a blocker-removing read. Before the engine checked `error`,
  // the slot list came back *freer* than reality and the move was written.
  for (const table of ['appointments', 'time_off', 'availability_exceptions', 'business_hours']) {
    it(`writes nothing when the ${table} read resolves with an error`, async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(createServiceRoleClient).mockReturnValue(
        mockSupabase({ [table]: { message: 'boom' } }) as never
      )

      const result = await reschedule().execute(ARGS)

      expect(result).toEqual({ error: 'availability_check_failed' })
      expect(rescheduleAppointmentByEmailServiceRole).not.toHaveBeenCalled()

      consoleError.mockRestore()
    })
  }
})
