import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/data/booking-service', () => ({
  findClientAppointmentsByEmailServiceRole: vi.fn(),
  cancelAppointmentByEmailServiceRole: vi.fn(),
  rescheduleAppointmentByEmailServiceRole: vi.fn(),
}))

vi.mock('@/lib/data/availability-engine', () => ({
  getAvailableSlots: vi.fn(),
}))

import {
  findClientAppointmentsByEmailServiceRole,
  cancelAppointmentByEmailServiceRole,
  rescheduleAppointmentByEmailServiceRole,
  type AppointmentRow,
} from '@/lib/data/booking-service'
import { getAvailableSlots } from '@/lib/data/availability-engine'
import {
  buildManageBookingToolHandlers,
  describeAppointment,
  describeMany,
  isDateOnlyIntent,
  isWindowFree,
  mergeFreeRanges,
  rankAlternatives,
  utcDatePlus,
} from './manage-booking-handlers'

/**
 * Every classification in this feature is relative to "now", so the clock is
 * pinned — this is what keeps these suites from rotting the way
 * `availability-engine.test.ts`'s date-pinned fixtures did.
 */
const NOW = new Date('2026-08-03T12:00:00Z')

const CONTEXT = {
  organizationId: 'org-1',
  agentId: 'agent-1',
  conversationId: 'conv-1',
}

function tool(name: string) {
  const handler = buildManageBookingToolHandlers(CONTEXT).find((entry) => entry.name === name)
  if (!handler) throw new Error(`no such tool: ${name}`)
  return handler
}

function row(overrides: Partial<AppointmentRow> & { id: string }): AppointmentRow {
  return {
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
    ...overrides,
  }
}

const EMAIL = 'ada@example.com'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('find_appointment', () => {
  it('reports nothing booked when the caller has no rows at all', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([])

    const result = await tool('find_appointment').execute({ clientEmail: EMAIL })

    expect(result).toEqual({ found: false, hadRecentCancelledOrPast: false })
  })

  it('distinguishes "nothing upcoming" from "nothing at all"', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([
      row({ id: 'past', starts_at: '2026-07-20T14:00:00+00:00', ends_at: '2026-07-20T14:30:00+00:00' }),
      row({ id: 'cancelled', status: 'cancelled' }),
    ])

    const result = await tool('find_appointment').execute({ clientEmail: EMAIL })

    expect(result).toEqual({ found: false, hadRecentCancelledOrPast: true })
  })

  it('returns upcoming non-cancelled appointments soonest first, capped at five', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([
      row({ id: 'a6', starts_at: '2026-08-12T09:00:00+00:00', ends_at: '2026-08-12T09:30:00+00:00' }),
      row({ id: 'a1', starts_at: '2026-08-04T09:00:00+00:00', ends_at: '2026-08-04T09:30:00+00:00' }),
      row({ id: 'a2', starts_at: '2026-08-05T09:00:00+00:00', ends_at: '2026-08-05T09:30:00+00:00' }),
      row({ id: 'a3', starts_at: '2026-08-06T09:00:00+00:00', ends_at: '2026-08-06T09:30:00+00:00' }),
      row({ id: 'a4', starts_at: '2026-08-07T09:00:00+00:00', ends_at: '2026-08-07T09:30:00+00:00' }),
      row({ id: 'a5', starts_at: '2026-08-08T09:00:00+00:00', ends_at: '2026-08-08T09:30:00+00:00' }),
      row({ id: 'gone', status: 'cancelled', starts_at: '2026-08-04T11:00:00+00:00' }),
      row({ id: 'old', starts_at: '2026-07-30T09:00:00+00:00', ends_at: '2026-07-30T09:30:00+00:00' }),
    ])

    const result = (await tool('find_appointment').execute({ clientEmail: EMAIL })) as {
      found: true
      totalUpcoming: number
      appointments: { appointmentId: string }[]
    }

    expect(result.found).toBe(true)
    expect(result.totalUpcoming).toBe(6)
    expect(result.appointments.map((a) => a.appointmentId)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])
  })

  it('reads 30 days back with the context org, never a model-supplied one', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([])

    await tool('find_appointment').execute({ clientEmail: EMAIL, organizationId: 'org-evil' })

    expect(findClientAppointmentsByEmailServiceRole).toHaveBeenCalledWith('org-1', EMAIL, {
      sinceIso: '2026-07-04T12:00:00.000Z',
      limit: 100,
    })
  })

  it('reports lookup_failed rather than "nothing booked" when the read fails', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockRejectedValue(new Error('db down'))

    const result = await tool('find_appointment').execute({ clientEmail: EMAIL })

    expect(result).toEqual({ error: 'lookup_failed' })
  })
})

describe('cancel_appointment', () => {
  const args = { clientEmail: EMAIL, startsAt: '2026-08-05T14:00:00Z' }

  it('cancels the resolved appointment and confirms which one changed', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])
    vi.mocked(cancelAppointmentByEmailServiceRole).mockResolvedValue({ success: true })

    const result = await tool('cancel_appointment').execute(args)

    expect(cancelAppointmentByEmailServiceRole).toHaveBeenCalledWith('org-1', 'appt-1', EMAIL)
    expect(result).toEqual({
      success: true,
      appointmentId: 'appt-1',
      title: 'Haircut',
      startsAt: '2026-08-05T14:00:00+00:00',
      endsAt: '2026-08-05T14:30:00+00:00',
      summary: 'Haircut on Wednesday, August 5 at 2:00 PM UTC',
    })
  })

  it('refuses an appointment id that is not in the caller\'s own set, and writes nothing', async () => {
    // The caller's own appointment resolves fine; the id they supplied belongs
    // to someone else, so the id-and-time narrowing empties the candidate set.
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])

    const result = await tool('cancel_appointment').execute({
      ...args,
      appointmentId: '00000000-0000-4000-8000-000000000999',
    })

    expect(result).toEqual({ error: 'appointment_not_found' })
    expect(cancelAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('scopes the lookup to the context org and writes nothing for a cross-org attempt', async () => {
    // The appointment exists, but in another org — so the org-scoped lookup
    // returns nothing and the caller gets the same answer as a bad id.
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([])

    const result = await tool('cancel_appointment').execute({
      ...args,
      organizationId: 'org-evil',
      appointmentId: '00000000-0000-4000-8000-000000000999',
    })

    expect(result).toEqual({ error: 'appointment_not_found' })
    expect(findClientAppointmentsByEmailServiceRole).toHaveBeenCalledWith(
      'org-1',
      EMAIL,
      expect.anything()
    )
    expect(cancelAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('asks the caller to confirm when nothing is booked at the stated time, and writes nothing', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])

    const result = (await tool('cancel_appointment').execute({
      ...args,
      startsAt: '2026-08-05T15:00:00Z',
    })) as { error: string; appointments: { appointmentId: string }[] }

    expect(result.error).toBe('confirm_appointment')
    expect(result.appointments.map((a) => a.appointmentId)).toEqual(['appt-1'])
    expect(cancelAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('returns the candidates when a date-only request matches two rows that day', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([
      row({ id: 'appt-1' }),
      row({ id: 'appt-2', starts_at: '2026-08-05T16:00:00+00:00', ends_at: '2026-08-05T16:30:00+00:00' }),
    ])

    const result = (await tool('cancel_appointment').execute({
      ...args,
      startsAt: '2026-08-05T00:00:00Z',
    })) as { error: string; appointments: { appointmentId: string }[] }

    expect(result.error).toBe('multiple_matches')
    expect(result.appointments.map((a) => a.appointmentId)).toEqual(['appt-1', 'appt-2'])
    expect(cancelAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('returns the candidates when two appointments share the same start instant', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([
      row({ id: 'appt-1' }),
      row({ id: 'appt-2', title: 'Colour' }),
    ])

    const result = (await tool('cancel_appointment').execute(args)) as {
      error: string
      appointments: { appointmentId: string }[]
    }

    expect(result.error).toBe('multiple_matches')
    expect(result.appointments.map((a) => a.appointmentId)).toEqual(['appt-1', 'appt-2'])
    expect(cancelAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('cancels a genuine midnight-UTC appointment through the instant match, not the date fallback', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([
      row({ id: 'midnight', starts_at: '2026-08-05T00:00:00+00:00', ends_at: '2026-08-05T00:30:00+00:00' }),
      row({ id: 'afternoon' }),
    ])
    vi.mocked(cancelAppointmentByEmailServiceRole).mockResolvedValue({ success: true })

    const result = (await tool('cancel_appointment').execute({
      ...args,
      startsAt: '2026-08-05T00:00:00Z',
    })) as { success: true; appointmentId: string }

    expect(result.appointmentId).toBe('midnight')
    expect(cancelAppointmentByEmailServiceRole).toHaveBeenCalledWith('org-1', 'midnight', EMAIL)
  })

  it('reports an already-cancelled appointment without writing', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([
      row({ id: 'appt-1', status: 'cancelled' }),
    ])

    const result = await tool('cancel_appointment').execute(args)

    expect(result).toEqual({
      error: 'appointment_already_cancelled',
      summary: 'Haircut on Wednesday, August 5 at 2:00 PM UTC',
    })
    expect(cancelAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('refuses a past appointment without writing', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([
      row({ id: 'appt-1', starts_at: '2026-07-20T14:00:00+00:00', ends_at: '2026-07-20T14:30:00+00:00' }),
    ])

    const result = (await tool('cancel_appointment').execute({
      ...args,
      startsAt: '2026-07-20T14:00:00Z',
    })) as { error: string }

    expect(result.error).toBe('appointment_in_past')
    expect(cancelAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('maps a service-level ownership failure to appointment_not_found', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])
    vi.mocked(cancelAppointmentByEmailServiceRole).mockResolvedValue({
      error: 'Appointment not found.',
      code: 'not_found',
    })

    expect(await tool('cancel_appointment').execute(args)).toEqual({
      error: 'appointment_not_found',
    })
  })

  it('maps a service-level database failure to cancel_failed', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])
    vi.mocked(cancelAppointmentByEmailServiceRole).mockResolvedValue({
      error: 'Could not cancel. Please try again.',
      code: 'update_failed',
    })

    expect(await tool('cancel_appointment').execute(args)).toEqual({ error: 'cancel_failed' })
  })

  it('returns lookup_failed instead of throwing when the read fails', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockRejectedValue(new Error('db down'))

    expect(await tool('cancel_appointment').execute(args)).toEqual({ error: 'lookup_failed' })
    expect(cancelAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('returns cancel_failed instead of throwing when the write rejects', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])
    vi.mocked(cancelAppointmentByEmailServiceRole).mockRejectedValue(new Error('db down'))

    expect(await tool('cancel_appointment').execute(args)).toEqual({ error: 'cancel_failed' })
  })
})

describe('reschedule_appointment', () => {
  const args = {
    clientEmail: EMAIL,
    startsAt: '2026-08-05T14:00:00Z',
    newStartsAt: '2026-08-06T09:00:00Z',
  }

  it('moves the appointment, preserving its length, and excludes it from its own availability', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([
      row({ id: 'appt-1', starts_at: '2026-08-05T14:00:00+00:00', ends_at: '2026-08-05T15:00:00+00:00' }),
    ])
    vi.mocked(getAvailableSlots).mockResolvedValue([
      {
        date: '2026-08-06',
        slots: [
          { startsAt: '2026-08-06T09:00:00.000Z', endsAt: '2026-08-06T09:30:00.000Z' },
          { startsAt: '2026-08-06T09:30:00.000Z', endsAt: '2026-08-06T10:00:00.000Z' },
        ],
      },
      { date: '2026-08-07', slots: [] },
      { date: '2026-08-08', slots: [] },
    ])
    vi.mocked(rescheduleAppointmentByEmailServiceRole).mockResolvedValue({ success: true })

    const result = await tool('reschedule_appointment').execute(args)

    expect(getAvailableSlots).toHaveBeenCalledWith('org-1', {
      serviceId: '',
      rangeStart: '2026-08-06',
      rangeEnd: '2026-08-08',
      excludeAppointmentId: 'appt-1',
    })
    expect(rescheduleAppointmentByEmailServiceRole).toHaveBeenCalledWith(
      'org-1',
      'appt-1',
      EMAIL,
      '2026-08-06T09:00:00.000Z',
      // 60 minutes in, 60 minutes out — the stored duration, not a model argument.
      '2026-08-06T10:00:00.000Z'
    )
    expect(result).toEqual({
      success: true,
      appointmentId: 'appt-1',
      title: 'Haircut',
      previousStartsAt: '2026-08-05T14:00:00+00:00',
      previousSummary: 'Haircut on Wednesday, August 5 at 2:00 PM UTC',
      startsAt: '2026-08-06T09:00:00.000Z',
      endsAt: '2026-08-06T10:00:00.000Z',
      summary: 'Haircut on Thursday, August 6 at 9:00 AM UTC',
    })
  })

  it('offers alternatives and writes nothing when the requested window is taken', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])
    vi.mocked(getAvailableSlots).mockResolvedValue([
      {
        date: '2026-08-06',
        slots: [
          { startsAt: '2026-08-06T11:00:00.000Z', endsAt: '2026-08-06T11:30:00.000Z' },
          { startsAt: '2026-08-06T10:00:00.000Z', endsAt: '2026-08-06T10:30:00.000Z' },
        ],
      },
      {
        date: '2026-08-07',
        slots: [{ startsAt: '2026-08-07T09:00:00.000Z', endsAt: '2026-08-07T09:30:00.000Z' }],
      },
      { date: '2026-08-08', slots: [] },
    ])

    const result = (await tool('reschedule_appointment').execute(args)) as {
      error: string
      requestedStartsAt: string
      alternatives: { startsAt: string }[]
      alternativesFound: boolean
      reason: string
    }

    expect(result.error).toBe('slot_unavailable')
    expect(result.reason).toBe('time_taken')
    expect(result.alternativesFound).toBe(true)
    expect(result.requestedStartsAt).toBe('2026-08-06T09:00:00.000Z')
    // Same requested day first, nearest to the requested time; then later days.
    expect(result.alternatives.map((alt) => alt.startsAt)).toEqual([
      '2026-08-06T10:00:00.000Z',
      '2026-08-06T11:00:00.000Z',
      '2026-08-07T09:00:00.000Z',
    ])
    expect(rescheduleAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('signals an empty window explicitly rather than claiming the business is full', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { date: '2026-08-06', slots: [] },
      { date: '2026-08-07', slots: [] },
      { date: '2026-08-08', slots: [] },
    ])

    const result = (await tool('reschedule_appointment').execute(args)) as {
      error: string
      alternatives: unknown[]
      alternativesFound: boolean
      reason: string
    }

    expect(result.error).toBe('slot_unavailable')
    expect(result.alternatives).toEqual([])
    expect(result.alternativesFound).toBe(false)
    expect(result.reason).toBe('no_availability_in_window')
    expect(rescheduleAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('refuses a new time in the past without calling the availability engine', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])

    const result = await tool('reschedule_appointment').execute({
      ...args,
      newStartsAt: '2026-08-01T09:00:00Z',
    })

    expect(result).toEqual({ error: 'new_time_in_past' })
    expect(getAvailableSlots).not.toHaveBeenCalled()
    expect(rescheduleAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('reports a no-op move instead of rewriting the same time', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])

    const result = await tool('reschedule_appointment').execute({
      ...args,
      newStartsAt: '2026-08-05T14:00:00Z',
    })

    expect(result).toEqual({
      error: 'already_at_requested_time',
      summary: 'Haircut on Wednesday, August 5 at 2:00 PM UTC',
    })
    expect(rescheduleAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('returns availability_check_failed when the engine rejects', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])
    vi.mocked(getAvailableSlots).mockRejectedValue(new Error('db down'))

    expect(await tool('reschedule_appointment').execute(args)).toEqual({
      error: 'availability_check_failed',
    })
    expect(rescheduleAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('returns reschedule_failed when the write rejects', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])
    vi.mocked(getAvailableSlots).mockResolvedValue([
      {
        date: '2026-08-06',
        slots: [{ startsAt: '2026-08-06T09:00:00.000Z', endsAt: '2026-08-06T09:30:00.000Z' }],
      },
    ])
    vi.mocked(rescheduleAppointmentByEmailServiceRole).mockRejectedValue(new Error('db down'))

    expect(await tool('reschedule_appointment').execute(args)).toEqual({
      error: 'reschedule_failed',
    })
  })

  it('returns reschedule_failed for a stored row with a non-positive duration', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([
      row({ id: 'appt-1', ends_at: '2026-08-05T14:00:00+00:00' }),
    ])

    expect(await tool('reschedule_appointment').execute(args)).toEqual({
      error: 'reschedule_failed',
    })
    expect(getAvailableSlots).not.toHaveBeenCalled()
  })

  it('writes nothing for a cross-caller appointment id', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([row({ id: 'appt-1' })])

    const result = await tool('reschedule_appointment').execute({
      ...args,
      appointmentId: '00000000-0000-4000-8000-000000000999',
    })

    expect(result).toEqual({ error: 'appointment_not_found' })
    expect(getAvailableSlots).not.toHaveBeenCalled()
    expect(rescheduleAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })

  it('writes nothing for a cross-org attempt and keeps the context org', async () => {
    vi.mocked(findClientAppointmentsByEmailServiceRole).mockResolvedValue([])

    const result = await tool('reschedule_appointment').execute({
      ...args,
      organizationId: 'org-evil',
    })

    expect(result).toEqual({ error: 'appointment_not_found' })
    expect(findClientAppointmentsByEmailServiceRole).toHaveBeenCalledWith(
      'org-1',
      EMAIL,
      expect.anything()
    )
    expect(rescheduleAppointmentByEmailServiceRole).not.toHaveBeenCalled()
  })
})

describe('no tool accepts an organization selector', () => {
  it('has no organizationId in any schema', () => {
    for (const handler of buildManageBookingToolHandlers(CONTEXT)) {
      expect(Object.keys(handler.parameters.shape)).not.toContain('organizationId')
    }
  })
})

describe('mergeFreeRanges', () => {
  it('merges adjacent and overlapping slots and sorts unordered input', () => {
    expect(
      mergeFreeRanges([
        { startsAt: '2026-08-06T09:30:00.000Z', endsAt: '2026-08-06T10:00:00.000Z' },
        { startsAt: '2026-08-06T09:00:00.000Z', endsAt: '2026-08-06T09:30:00.000Z' },
        { startsAt: '2026-08-06T09:15:00.000Z', endsAt: '2026-08-06T09:45:00.000Z' },
      ])
    ).toEqual([
      {
        startMs: Date.parse('2026-08-06T09:00:00.000Z'),
        endMs: Date.parse('2026-08-06T10:00:00.000Z'),
      },
    ])
  })

  it('keeps disjoint slots separate', () => {
    expect(
      mergeFreeRanges([
        { startsAt: '2026-08-06T09:00:00.000Z', endsAt: '2026-08-06T09:30:00.000Z' },
        { startsAt: '2026-08-06T11:00:00.000Z', endsAt: '2026-08-06T11:30:00.000Z' },
      ])
    ).toHaveLength(2)
  })
})

describe('isWindowFree', () => {
  const slots = [
    { startsAt: '2026-08-06T09:00:00.000Z', endsAt: '2026-08-06T09:30:00.000Z' },
    { startsAt: '2026-08-06T09:30:00.000Z', endsAt: '2026-08-06T10:00:00.000Z' },
    { startsAt: '2026-08-06T11:00:00.000Z', endsAt: '2026-08-06T11:30:00.000Z' },
  ]

  it('accepts a window equal to one slot', () => {
    expect(isWindowFree(slots, '2026-08-06T09:00:00Z', '2026-08-06T09:30:00Z')).toBe(true)
  })

  it('accepts a window longer than one slot but inside a merged range', () => {
    expect(isWindowFree(slots, '2026-08-06T09:00:00Z', '2026-08-06T10:00:00Z')).toBe(true)
  })

  it('accepts an off-grid window inside a merged range', () => {
    expect(isWindowFree(slots, '2026-08-06T09:15:00Z', '2026-08-06T09:45:00Z')).toBe(true)
  })

  it('rejects a window straddling a gap', () => {
    expect(isWindowFree(slots, '2026-08-06T09:45:00Z', '2026-08-06T11:15:00Z')).toBe(false)
  })

  it('rejects a zero-length or inverted window', () => {
    expect(isWindowFree(slots, '2026-08-06T09:00:00Z', '2026-08-06T09:00:00Z')).toBe(false)
    expect(isWindowFree(slots, '2026-08-06T09:30:00Z', '2026-08-06T09:00:00Z')).toBe(false)
  })
})

describe('rankAlternatives', () => {
  const days = [
    {
      date: '2026-08-06',
      slots: [
        { startsAt: '2026-08-06T08:00:00.000Z', endsAt: '2026-08-06T08:30:00.000Z' },
        { startsAt: '2026-08-06T12:00:00.000Z', endsAt: '2026-08-06T12:30:00.000Z' },
      ],
    },
    {
      date: '2026-08-07',
      slots: [{ startsAt: '2026-08-07T08:00:00.000Z', endsAt: '2026-08-07T08:30:00.000Z' }],
    },
  ]
  const requestedMs = Date.parse('2026-08-06T09:00:00.000Z')

  it('ranks same-day candidates nearest-first, then later days ascending', () => {
    expect(rankAlternatives(days, requestedMs, 30 * 60_000).map((a) => a.startsAt)).toEqual([
      '2026-08-06T08:00:00.000Z',
      '2026-08-06T12:00:00.000Z',
      '2026-08-07T08:00:00.000Z',
    ])
  })

  it('respects the limit', () => {
    expect(rankAlternatives(days, requestedMs, 30 * 60_000, 1)).toHaveLength(1)
  })

  it('returns nothing when the duration does not fit any free range', () => {
    expect(rankAlternatives(days, requestedMs, 120 * 60_000)).toEqual([])
  })
})

describe('describeAppointment / describeMany', () => {
  it('names the appointment and its UTC time', () => {
    expect(describeAppointment(row({ id: 'a' }))).toBe(
      'Haircut on Wednesday, August 5 at 2:00 PM UTC'
    )
  })

  it('sorts soonest-first, honors the cap, and rounds the duration', () => {
    const briefs = describeMany(
      [
        row({ id: 'late', starts_at: '2026-08-09T09:00:00+00:00', ends_at: '2026-08-09T09:45:00+00:00' }),
        row({ id: 'early', starts_at: '2026-08-08T09:00:00+00:00', ends_at: '2026-08-08T09:30:00+00:00' }),
      ],
      1
    )

    expect(briefs).toHaveLength(1)
    expect(briefs[0].appointmentId).toBe('early')
    expect(briefs[0].durationMinutes).toBe(30)
  })
})

describe('utcDatePlus', () => {
  it('crosses a month boundary', () => {
    expect(utcDatePlus('2026-08-30', 2)).toBe('2026-09-01')
  })
})

describe('isDateOnlyIntent', () => {
  it('is true only for a literal midnight in UTC', () => {
    expect(isDateOnlyIntent('2026-08-05T00:00:00Z')).toBe(true)
    expect(isDateOnlyIntent('2026-08-05T00:00:00.000Z')).toBe(true)
    expect(isDateOnlyIntent('2026-08-05T00:00:00+00:00')).toBe(true)
    expect(isDateOnlyIntent('2026-08-05T00:00:00+05:00')).toBe(false)
    expect(isDateOnlyIntent('2026-08-05T15:00:00Z')).toBe(false)
  })
})
