import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findOrCreateClientServiceRole,
  createAppointmentServiceRole,
  findClientAppointmentsByEmailServiceRole,
  getUpcomingAppointmentsByEmailServiceRole,
  cancelAppointmentByEmailServiceRole,
  rescheduleAppointmentByEmailServiceRole,
} from './booking-service'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/integrations/webhook', () => ({
  dispatchWebhook: vi.fn(),
}))

vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchNotification: vi.fn(() => Promise.resolve()),
  scheduleAppointmentReminder: vi.fn(() => Promise.resolve()),
  cancelAppointmentReminder: vi.fn(),
}))

vi.mock('@/lib/integrations/google-calendar-sync', () => ({
  handleAppointmentCreated: vi.fn(),
  handleAppointmentUpdated: vi.fn(),
  handleAppointmentCancelled: vi.fn(),
}))

vi.mock('@/lib/integrations/calcom', () => ({
  handleCalComAppointmentCreated: vi.fn(),
  handleCalComAppointmentUpdated: vi.fn(),
  handleCalComAppointmentCancelled: vi.fn(),
}))

vi.mock('@/lib/integrations/microsoft-calendar-sync', () => ({
  handleMicrosoftAppointmentCreated: vi.fn(),
  handleMicrosoftAppointmentUpdated: vi.fn(),
  handleMicrosoftAppointmentCancelled: vi.fn(),
}))

vi.mock('@/lib/integrations/calendly', () => ({
  handleCalendlyAppointmentCreated: vi.fn(),
  handleCalendlyAppointmentUpdated: vi.fn(),
  handleCalendlyAppointmentCancelled: vi.fn(),
}))

describe('findOrCreateClientServiceRole', () => {
  it('reuses an existing client matched by phone number', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'client-1' }, error: null })
    const phoneEq = vi.fn().mockReturnValue({ maybeSingle })
    const orgEq = vi.fn().mockReturnValue({ eq: phoneEq })
    const select = vi.fn().mockReturnValue({ eq: orgEq })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    const result = await findOrCreateClientServiceRole('org-1', {
      name: 'Ada Lovelace',
      phoneNumber: '+15551234567',
      email: 'ada@example.com',
    })

    expect(result).toEqual({ id: 'client-1', isNew: false })
    expect(phoneEq).toHaveBeenCalledWith('phone_number', '+15551234567')
  })

  it('creates a new client when no phone or email match exists', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const lookupMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const phoneEq = vi.fn().mockReturnValue({ maybeSingle: lookupMaybeSingle })
    const orgEq = vi.fn().mockReturnValue({ eq: phoneEq })
    const lookupSelect = vi.fn().mockReturnValue({ eq: orgEq })
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'client-2' }, error: null })
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select: lookupSelect, insert })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    const result = await findOrCreateClientServiceRole('org-1', {
      name: 'Ada Lovelace',
      phoneNumber: '+15551234567',
      email: 'ada@example.com',
    })

    expect(result).toEqual({ id: 'client-2', isNew: true })
    expect(insert).toHaveBeenCalledWith({
      organization_id: 'org-1',
      name: 'Ada Lovelace',
      phone_number: '+15551234567',
      email: 'ada@example.com',
    })
  })

  it('falls back to email lookup when no phone is captured', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const emailMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'client-1' }, error: null })
    const emailEq = vi.fn().mockReturnValue({ maybeSingle: emailMaybeSingle })
    const orgEq = vi.fn().mockReturnValue({ eq: emailEq })
    const select = vi.fn().mockReturnValue({ eq: orgEq })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    const result = await findOrCreateClientServiceRole('org-1', {
      name: 'Ada Lovelace',
      phoneNumber: null,
      email: 'ada@example.com',
    })

    expect(result).toEqual({ id: 'client-1', isNew: false })
    expect(emailEq).toHaveBeenCalledWith('email', 'ada@example.com')
  })

  it('inserts with an "unknown" phone sentinel when no phone is given and no matching client exists', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const emailMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const emailEq = vi.fn().mockReturnValue({ maybeSingle: emailMaybeSingle })
    const orgEq = vi.fn().mockReturnValue({ eq: emailEq })
    const lookupSelect = vi.fn().mockReturnValue({ eq: orgEq })
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'client-3' }, error: null })
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select: lookupSelect, insert })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    const result = await findOrCreateClientServiceRole('org-1', {
      name: 'Ada Lovelace',
      phoneNumber: null,
      email: 'ada@example.com',
    })

    expect(result).toEqual({ id: 'client-3', isNew: true })
    expect(insert).toHaveBeenCalledWith({
      organization_id: 'org-1',
      name: 'Ada Lovelace',
      phone_number: 'unknown',
      email: 'ada@example.com',
    })
  })
})

describe('createAppointmentServiceRole', () => {
  it('inserts an appointment with client_id, conversation_id, and confirmed status', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const row = {
      id: 'appt-1',
      organization_id: 'org-1',
      agent_id: 'agent-1',
      title: 'Consultation',
      client_name: 'Ada Lovelace',
      client_phone: '+15551234567',
      client_id: 'client-1',
      conversation_id: 'conv-1',
      starts_at: '2026-08-03T14:00:00Z',
      ends_at: '2026-08-03T15:00:00Z',
      notes: null,
      status: 'confirmed',
      created_at: '2026-08-03T13:00:00Z',
      updated_at: '2026-08-03T13:00:00Z',
    }
    const single = vi.fn().mockResolvedValue({ data: row, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    const result = await createAppointmentServiceRole(
      'org-1',
      'agent-1',
      'conv-1',
      {
        title: 'Consultation',
        clientName: 'Ada Lovelace',
        clientPhone: '+15551234567',
        clientId: 'client-1',
        startsAt: '2026-08-03T14:00:00Z',
        endsAt: '2026-08-03T15:00:00Z',
      }
    )

    expect(result.id).toBe('appt-1')
    expect(insert).toHaveBeenCalledWith({
      organization_id: 'org-1',
      agent_id: 'agent-1',
      title: 'Consultation',
      client_name: 'Ada Lovelace',
      client_phone: '+15551234567',
      client_id: 'client-1',
      conversation_id: 'conv-1',
      starts_at: '2026-08-03T14:00:00Z',
      ends_at: '2026-08-03T15:00:00Z',
      notes: null,
      service_id: null,
      staff_id: null,
      status: 'confirmed',
    })
  })

  it('persists serviceId and staffId when provided', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const single = vi.fn().mockResolvedValue({ data: { id: 'appt-2' }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    await createAppointmentServiceRole('org-1', 'agent-1', 'conv-1', {
      title: 'Personal training',
      clientName: 'Ada Lovelace',
      clientPhone: null,
      clientId: 'client-1',
      startsAt: '2026-08-10T09:00:00.000Z',
      endsAt: '2026-08-10T09:30:00.000Z',
      serviceId: 'svc-1',
      staffId: 'staff-1',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ service_id: 'svc-1', staff_id: 'staff-1' })
    )
  })

  it('accepts null agentId/conversationId for page-booked appointments', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const single = vi.fn().mockResolvedValue({ data: { id: 'appt-3' }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    await createAppointmentServiceRole('org-1', null, null, {
      title: 'Online booking',
      clientName: 'Ada Lovelace',
      clientPhone: null,
      clientId: 'client-1',
      startsAt: '2026-08-10T09:00:00.000Z',
      endsAt: '2026-08-10T09:30:00.000Z',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: null, conversation_id: null, service_id: null, staff_id: null })
    )
  })

  it('throws when the insert fails', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)
    const { dispatchNotification } = await import('@/lib/notifications/dispatch')
    vi.mocked(dispatchNotification).mockClear()

    await expect(
      createAppointmentServiceRole('org-1', 'agent-1', 'conv-1', {
        title: 'Consultation',
        clientName: 'Ada Lovelace',
        clientPhone: null,
        clientId: 'client-1',
        startsAt: '2026-08-03T14:00:00Z',
        endsAt: '2026-08-03T15:00:00Z',
      })
    ).rejects.toThrow('boom')
    expect(dispatchNotification).not.toHaveBeenCalled()
  })

  /**
   * Round-2 issue 4. A phone booking used to be announced only from the call's
   * terminal conversation write, so a hard-killed voice worker meant no booking
   * notification and no reminder, ever. It is announced where it is written.
   */
  describe('notifying the organization', () => {
    async function mockInsert(row: Record<string, unknown>) {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
      const single = vi.fn().mockResolvedValue({ data: row, error: null })
      const select = vi.fn().mockReturnValue({ single })
      const insert = vi.fn().mockReturnValue({ select })
      vi.mocked(createServiceRoleClient).mockReturnValue({
        from: vi.fn().mockReturnValue({ insert }),
      } as never)
    }

    const INPUT = {
      title: 'Consultation',
      clientName: 'Ada Lovelace',
      clientPhone: null,
      clientId: 'client-1',
      startsAt: '2026-08-10T14:00:00.000Z',
      endsAt: '2026-08-10T15:00:00.000Z',
    }

    it('dispatches the booking and schedules the reminder at creation', async () => {
      await mockInsert({ id: 'appt-9', starts_at: '2026-08-10T14:00:00+00:00' })
      const { dispatchNotification, scheduleAppointmentReminder } = await import(
        '@/lib/notifications/dispatch'
      )
      vi.mocked(dispatchNotification).mockClear()
      vi.mocked(scheduleAppointmentReminder).mockClear()

      await createAppointmentServiceRole('org-1', 'agent-1', 'conv-1', INPUT)

      expect(dispatchNotification).toHaveBeenCalledWith({
        type: 'client_booking',
        organizationId: 'org-1',
        appointmentId: 'appt-9',
      })
      expect(scheduleAppointmentReminder).toHaveBeenCalledWith(
        'org-1',
        'appt-9',
        '2026-08-10T14:00:00+00:00'
      )
    })

    it('still returns the booking when both dispatches reject', async () => {
      await mockInsert({ id: 'appt-9', starts_at: '2026-08-10T14:00:00+00:00' })
      const { dispatchNotification, scheduleAppointmentReminder } = await import(
        '@/lib/notifications/dispatch'
      )
      vi.mocked(dispatchNotification).mockRejectedValueOnce(new Error('redis down'))
      vi.mocked(scheduleAppointmentReminder).mockRejectedValueOnce(new Error('redis down'))
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        createAppointmentServiceRole('org-1', 'agent-1', 'conv-1', INPUT)
      ).resolves.toMatchObject({ id: 'appt-9' })
      // Let the swallowed rejections settle inside this test.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(error).toHaveBeenCalledWith(
        '[notifications] booking dispatch failed:',
        expect.any(Error)
      )
      error.mockRestore()
    })
  })
})

type QueryResult = { data: unknown; error: unknown }

/**
 * `clients` narrowed by `ilike`, then one or two `appointments` queries.
 *
 * The appointments read is split in two when the caller asks for a lookback
 * window: a forward query from now (`.gte` only) and a descending lookback
 * (`.gte` then `.lt`). `calls` records the filters each one applied so a test
 * can tell them apart, because both run through the same chainable node.
 */
function mockLookupClient(options: {
  clients?: QueryResult
  /** The forward (now-onwards, ascending) query. */
  appointments?: QueryResult
  /** The descending lookback query, when one is issued. */
  lookback?: QueryResult
}) {
  const ilike = vi
    .fn()
    .mockResolvedValue(options.clients ?? { data: [{ id: 'client-1', email: 'ada@example.com' }], error: null })
  const clientOrgEq = vi.fn().mockReturnValue({ ilike })
  const clientSelect = vi.fn().mockReturnValue({ eq: clientOrgEq })

  type AppointmentCall = {
    organizationId?: string
    clientIds?: string[]
    gte?: string
    lt?: string
    ascending?: boolean
    limit?: number
  }
  const calls: AppointmentCall[] = []

  function node(call: AppointmentCall): Record<string, unknown> {
    return {
      eq: (_column: string, value: string) => {
        call.organizationId = value
        return node(call)
      },
      in: (_column: string, value: string[]) => {
        call.clientIds = value
        return node(call)
      },
      gte: (_column: string, value: string) => {
        call.gte = value
        return node(call)
      },
      lt: (_column: string, value: string) => {
        call.lt = value
        return node(call)
      },
      order: (_column: string, opts: { ascending: boolean }) => {
        call.ascending = opts.ascending
        return node(call)
      },
      limit: (value: number) => {
        call.limit = value
        return Promise.resolve(
          call.ascending === false
            ? options.lookback ?? { data: [], error: null }
            : options.appointments ?? { data: [], error: null }
        )
      },
    }
  }

  const apptSelect = vi.fn(() => {
    const call: AppointmentCall = {}
    calls.push(call)
    return node(call)
  })

  const from = vi.fn((table: string) =>
    table === 'clients' ? { select: clientSelect } : { select: apptSelect }
  )

  return { from, ilike, clientOrgEq, apptSelect, calls }
}

async function useMock(mock: { from: unknown }) {
  const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
  vi.mocked(createServiceRoleClient).mockReturnValue({ from: mock.from } as never)
}

describe('findClientAppointmentsByEmailServiceRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('scopes both queries to the organization and narrows clients with ilike', async () => {
    const mock = mockLookupClient({})
    await useMock(mock)

    await findClientAppointmentsByEmailServiceRole('org-1', '  ada@example.com  ')

    expect(mock.clientOrgEq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(mock.ilike).toHaveBeenCalledWith('email', 'ada@example.com')
    expect(mock.calls[0].organizationId).toBe('org-1')
  })

  it('matches case-insensitively on the stored address', async () => {
    const mock = mockLookupClient({
      clients: { data: [{ id: 'client-1', email: 'Ada@Example.COM' }], error: null },
      appointments: { data: [{ id: 'appt-1' }], error: null },
    })
    await useMock(mock)

    const rows = await findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com')

    expect(rows).toEqual([{ id: 'appt-1' }])
  })

  it('rejects a client row that only matched because "_" is a LIKE wildcard', async () => {
    // `ilike` can over-match; the JS equality check is what authorizes, so a
    // widened candidate set can never produce a false identity match.
    const mock = mockLookupClient({
      clients: { data: [{ id: 'other', email: 'adaX@example.com' }], error: null },
    })
    await useMock(mock)

    const rows = await findClientAppointmentsByEmailServiceRole('org-1', 'ada_@example.com')

    expect(rows).toEqual([])
    expect(mock.apptSelect).not.toHaveBeenCalled()
  })

  it('collapses several client rows sharing an address into one appointments query', async () => {
    const mock = mockLookupClient({
      clients: {
        data: [
          { id: 'client-1', email: 'ada@example.com' },
          { id: 'client-2', email: 'ada@example.com' },
        ],
        error: null,
      },
    })
    await useMock(mock)

    await findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com')

    expect(mock.calls[0].clientIds).toEqual(['client-1', 'client-2'])
  })

  it('short-circuits without an appointments query when no client matches', async () => {
    const mock = mockLookupClient({ clients: { data: [], error: null } })
    await useMock(mock)

    expect(await findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com')).toEqual([])
    expect(mock.apptSelect).not.toHaveBeenCalled()
  })

  it('issues one forward query with a default limit of 50 when there is no lookback', async () => {
    const mock = mockLookupClient({})
    await useMock(mock)

    await findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com')

    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0].limit).toBe(50)
    expect(mock.calls[0].ascending).toBe(true)
    expect(mock.calls[0].lt).toBeUndefined()
  })

  // The regression this guards: one `.order('starts_at').limit(100)` over a
  // window starting 30 days in the past keeps the *earliest* 100 rows, so a
  // shared address with heavy recent history spends the whole budget on past
  // rows and the caller is told they have nothing booked.
  it('spends the row budget forward and reads history in a second, bounded query', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'))
    try {
      const mock = mockLookupClient({
        appointments: { data: [{ id: 'future', starts_at: '2026-08-05T14:00:00+00:00' }], error: null },
        lookback: { data: [{ id: 'past', starts_at: '2026-07-20T14:00:00+00:00' }], error: null },
      })
      await useMock(mock)

      const rows = await findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com', {
        sinceIso: '2026-07-04T12:00:00.000Z',
        limit: 100,
      })

      expect(mock.calls).toHaveLength(2)

      const forward = mock.calls.find((call) => call.ascending === true)
      expect(forward?.gte).toBe('2026-08-03T12:00:00.000Z')
      expect(forward?.lt).toBeUndefined()
      expect(forward?.limit).toBe(100)

      const lookback = mock.calls.find((call) => call.ascending === false)
      expect(lookback?.gte).toBe('2026-07-04T12:00:00.000Z')
      expect(lookback?.lt).toBe('2026-08-03T12:00:00.000Z')
      expect(lookback?.limit).toBe(25)

      // Merged back into one ascending list, so callers see the same shape.
      expect(rows.map((row) => row.id)).toEqual(['past', 'future'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps every upcoming row even when the lookback query is already saturated', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'))
    try {
      // 25 past rows — the whole lookback budget — plus a real future one. The
      // single-query version would have returned only past rows here.
      const past = Array.from({ length: 25 }, (_, index) => ({
        id: `past-${index}`,
        starts_at: new Date(Date.parse('2026-08-02T00:00:00Z') - index * 3_600_000).toISOString(),
      }))
      const mock = mockLookupClient({
        appointments: { data: [{ id: 'future', starts_at: '2026-08-05T14:00:00+00:00' }], error: null },
        lookback: { data: past, error: null },
      })
      await useMock(mock)

      const rows = await findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com', {
        sinceIso: '2026-07-04T12:00:00.000Z',
        limit: 100,
      })

      expect(rows).toHaveLength(26)
      expect(rows[rows.length - 1].id).toBe('future')
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws when the lookback query errors', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'))
    try {
      const mock = mockLookupClient({ lookback: { data: null, error: { message: 'boom' } } })
      await useMock(mock)

      await expect(
        findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com', {
          sinceIso: '2026-07-04T12:00:00.000Z',
        })
      ).rejects.toThrow('appointment lookback failed: boom')
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws when the client query errors, so "no appointment" is always a real answer', async () => {
    const mock = mockLookupClient({ clients: { data: null, error: { message: 'boom' } } })
    await useMock(mock)

    await expect(
      findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com')
    ).rejects.toThrow('client lookup failed: boom')
  })

  it('throws when the appointments query errors', async () => {
    const mock = mockLookupClient({ appointments: { data: null, error: { message: 'boom' } } })
    await useMock(mock)

    await expect(
      findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com')
    ).rejects.toThrow('appointment lookup failed: boom')
  })
})

describe('getUpcomingAppointmentsByEmailServiceRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('excludes cancelled rows and keeps the public lookup effectively uncapped', async () => {
    const mock = mockLookupClient({
      appointments: {
        data: [
          { id: 'appt-1', status: 'confirmed' },
          { id: 'appt-2', status: 'cancelled' },
        ],
        error: null,
      },
    })
    await useMock(mock)

    const rows = await getUpcomingAppointmentsByEmailServiceRole('org-1', 'ada@example.com')

    expect(rows).toEqual([{ id: 'appt-1', status: 'confirmed' }])
    expect(mock.calls[0].limit).toBe(500)
  })

  // It used to return `[]` here, which the booking page renders as "no upcoming
  // appointments found for that email" — a read failure shown as a real answer.
  // `lookupPublicAppointments` now catches this and renders a failure state.
  it('throws a read failure instead of passing it off as "nothing booked"', async () => {
    const mock = mockLookupClient({ clients: { data: null, error: { message: 'boom' } } })
    await useMock(mock)

    await expect(
      getUpcomingAppointmentsByEmailServiceRole('org-1', 'ada@example.com')
    ).rejects.toThrow('client lookup failed: boom')
  })
})

describe('cancelAppointmentByEmailServiceRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * The cancel write is a conditional UPDATE read back with `.select('id')`,
   * so `updatedRows` is what decides success: a conditional update that matches
   * nothing is not a PostgREST error, and reporting success off the absent error
   * alone is exactly the stale-write bug.
   */
  function mockCancel(options: {
    owner?: unknown
    updateError?: { message: string } | null
    /** Rows the conditional UPDATE actually matched. Empty means it lost a race. */
    updatedRows?: unknown[]
  }) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data:
        'owner' in options
          ? options.owner
          : { client_id: 'client-1', clients: { email: 'Ada@Example.com' } },
    })
    const assertOrgEq = vi.fn().mockReturnValue({ maybeSingle })
    const assertIdEq = vi.fn().mockReturnValue({ eq: assertOrgEq })
    const select = vi.fn().mockReturnValue({ eq: assertIdEq })

    const filters: { column: string; value: unknown }[] = []
    const updateSelect = vi.fn().mockResolvedValue({
      data: options.updateError ? null : options.updatedRows ?? [{ id: 'appt-1' }],
      error: options.updateError ?? null,
    })
    function updateNode(): Record<string, unknown> {
      return {
        eq: (column: string, value: unknown) => {
          filters.push({ column, value })
          return updateNode()
        },
        neq: (column: string, value: unknown) => {
          filters.push({ column: `not:${column}`, value })
          return updateNode()
        },
        select: updateSelect,
      }
    }
    const update = vi.fn(() => updateNode())

    const from = vi.fn().mockReturnValue({ select, update })
    return { from, update, filters, updateSelect }
  }

  it('cancels and fires the webhook plus all four calendar cancel handlers', async () => {
    const mock = mockCancel({})
    await useMock(mock)

    const result = await cancelAppointmentByEmailServiceRole('org-1', 'appt-1', 'ada@example.com')

    expect(result).toEqual({ success: true })
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    )
    expect(mock.filters).toEqual(
      expect.arrayContaining([
        { column: 'organization_id', value: 'org-1' },
        { column: 'not:status', value: 'cancelled' },
      ])
    )

    const { dispatchWebhook } = await import('@/lib/integrations/webhook')
    const { handleAppointmentCancelled } = await import('@/lib/integrations/google-calendar-sync')
    const { handleCalComAppointmentCancelled } = await import('@/lib/integrations/calcom')
    const { handleMicrosoftAppointmentCancelled } = await import(
      '@/lib/integrations/microsoft-calendar-sync'
    )
    const { handleCalendlyAppointmentCancelled } = await import('@/lib/integrations/calendly')

    expect(dispatchWebhook).toHaveBeenCalledWith('org-1', 'appointment.cancelled', {
      appointmentId: 'appt-1',
    })
    expect(handleAppointmentCancelled).toHaveBeenCalledWith('org-1', 'appt-1')
    expect(handleCalComAppointmentCancelled).toHaveBeenCalledWith('org-1', 'appt-1')
    expect(handleMicrosoftAppointmentCancelled).toHaveBeenCalledWith('org-1', 'appt-1')
    expect(handleCalendlyAppointmentCancelled).toHaveBeenCalled()
  })

  // Issue 1: a cancelled appointment must not keep a pending reminder, and this
  // is the cancel write behind both the public page and the voice tool.
  it('drops the pending reminder', async () => {
    await useMock(mockCancel({}))
    const { cancelAppointmentReminder } = await import('@/lib/notifications/dispatch')

    await cancelAppointmentByEmailServiceRole('org-1', 'appt-1', 'ada@example.com')

    expect(cancelAppointmentReminder).toHaveBeenCalledWith('appt-1')
  })

  it('keeps the reminder when the cancel matched no rows', async () => {
    await useMock(mockCancel({ updatedRows: [] }))
    const { cancelAppointmentReminder } = await import('@/lib/notifications/dispatch')

    await cancelAppointmentByEmailServiceRole('org-1', 'appt-1', 'ada@example.com')

    expect(cancelAppointmentReminder).not.toHaveBeenCalled()
  })

  it('returns code not_found and never updates when the email does not own the appointment', async () => {
    const mock = mockCancel({ owner: { client_id: 'client-9', clients: { email: 'eve@example.com' } } })
    await useMock(mock)

    const result = await cancelAppointmentByEmailServiceRole('org-1', 'appt-1', 'ada@example.com')

    expect(result).toEqual({ error: 'Appointment not found.', code: 'not_found' })
    expect(mock.update).not.toHaveBeenCalled()
  })

  it('returns code update_failed on a database error', async () => {
    const mock = mockCancel({ updateError: { message: 'boom' } })
    await useMock(mock)

    const result = await cancelAppointmentByEmailServiceRole('org-1', 'appt-1', 'ada@example.com')

    expect(result).toEqual({ error: 'Could not cancel. Please try again.', code: 'update_failed' })
  })

  it('pins the write to the start time the caller confirmed when one is given', async () => {
    const mock = mockCancel({})
    await useMock(mock)

    await cancelAppointmentByEmailServiceRole('org-1', 'appt-1', 'ada@example.com', {
      startsAt: '2026-08-05T14:00:00+00:00',
    })

    expect(mock.filters).toEqual(
      expect.arrayContaining([{ column: 'starts_at', value: '2026-08-05T14:00:00+00:00' }])
    )
  })

  // The competing-mutation case: the appointment moved (or was cancelled)
  // between the resolver's read and this write, so the conditional UPDATE
  // matches nothing. Without checking the affected rows this reported success
  // and the caller was told a cancellation happened that never did.
  it('reports a conflict, not success, when a competing change makes the write match no rows', async () => {
    const mock = mockCancel({ updatedRows: [] })
    await useMock(mock)

    const result = await cancelAppointmentByEmailServiceRole(
      'org-1',
      'appt-1',
      'ada@example.com',
      { startsAt: '2026-08-05T14:00:00+00:00' }
    )

    expect(result).toEqual({
      error: 'That appointment changed before we could cancel it. Please look it up again.',
      code: 'conflict',
    })

    // And nothing downstream is told a cancellation happened.
    const { dispatchWebhook } = await import('@/lib/integrations/webhook')
    const { handleAppointmentCancelled } = await import('@/lib/integrations/google-calendar-sync')
    expect(dispatchWebhook).not.toHaveBeenCalled()
    expect(handleAppointmentCancelled).not.toHaveBeenCalled()
  })
})

describe('rescheduleAppointmentByEmailServiceRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * The move goes through `reschedule_appointment_atomic` (migration `045`)
   * rather than a bare UPDATE, so the expected-start check and the destination
   * overlap check happen under one org-scoped advisory lock. These assert the
   * mapping from its status codes.
   */
  function mockReschedule(options: { owner?: unknown; rpc?: { data: unknown; error: unknown } }) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data:
        'owner' in options
          ? options.owner
          : { client_id: 'client-1', clients: { email: 'Ada@Example.com' } },
    })
    const assertOrgEq = vi.fn().mockReturnValue({ maybeSingle })
    const assertIdEq = vi.fn().mockReturnValue({ eq: assertOrgEq })
    const select = vi.fn().mockReturnValue({ eq: assertIdEq })
    const update = vi.fn()
    const from = vi.fn().mockReturnValue({ select, update })
    const rpc = vi.fn().mockResolvedValue(options.rpc ?? { data: 'ok', error: null })
    return { from, rpc, update }
  }

  async function useRescheduleMock(mock: { from: unknown; rpc: unknown }) {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue({
      from: mock.from,
      rpc: mock.rpc,
    } as never)
  }

  it('moves through the atomic function, passing the confirmed start, and never a bare update', async () => {
    const mock = mockReschedule({})
    await useRescheduleMock(mock)

    const result = await rescheduleAppointmentByEmailServiceRole(
      'org-1',
      'appt-1',
      'ada@example.com',
      '2026-08-06T09:00:00.000Z',
      '2026-08-06T09:30:00.000Z',
      { startsAt: '2026-08-05T14:00:00+00:00' }
    )

    expect(result).toEqual({ success: true })
    expect(mock.rpc).toHaveBeenCalledWith('reschedule_appointment_atomic', {
      p_organization_id: 'org-1',
      p_appointment_id: 'appt-1',
      p_starts_at: '2026-08-06T09:00:00.000Z',
      p_ends_at: '2026-08-06T09:30:00.000Z',
      p_expected_starts_at: '2026-08-05T14:00:00+00:00',
    })
    expect(mock.update).not.toHaveBeenCalled()

    const { handleAppointmentUpdated } = await import('@/lib/integrations/google-calendar-sync')
    expect(handleAppointmentUpdated).toHaveBeenCalledWith('org-1', 'appt-1')
  })

  /**
   * Issue 1. This function is the only reschedule write in the product — the
   * public booking page and the `reschedule_appointment` voice tool both land
   * here — so the reminder has to move from here or not at all.
   */
  it('re-points the reminder at the new start time', async () => {
    const mock = mockReschedule({})
    await useRescheduleMock(mock)
    const { scheduleAppointmentReminder } = await import('@/lib/notifications/dispatch')

    await rescheduleAppointmentByEmailServiceRole(
      'org-1',
      'appt-1',
      'ada@example.com',
      '2026-08-06T09:00:00.000Z',
      '2026-08-06T09:30:00.000Z'
    )

    expect(scheduleAppointmentReminder).toHaveBeenCalledWith(
      'org-1',
      'appt-1',
      '2026-08-06T09:00:00.000Z'
    )
  })

  it('leaves the reminder where it is when the move does not land', async () => {
    const mock = mockReschedule({ rpc: { data: 'destination_conflict', error: null } })
    await useRescheduleMock(mock)
    const { scheduleAppointmentReminder } = await import('@/lib/notifications/dispatch')

    await rescheduleAppointmentByEmailServiceRole(
      'org-1',
      'appt-1',
      'ada@example.com',
      '2026-08-06T09:00:00.000Z',
      '2026-08-06T09:30:00.000Z'
    )

    expect(scheduleAppointmentReminder).not.toHaveBeenCalled()
  })

  it('sends a null expected start for the public path, which has no confirmed time', async () => {
    const mock = mockReschedule({})
    await useRescheduleMock(mock)

    await rescheduleAppointmentByEmailServiceRole(
      'org-1',
      'appt-1',
      'ada@example.com',
      '2026-08-06T09:00:00.000Z',
      '2026-08-06T09:30:00.000Z'
    )

    expect(mock.rpc).toHaveBeenCalledWith(
      'reschedule_appointment_atomic',
      expect.objectContaining({ p_expected_starts_at: null })
    )
  })

  // A competing mutation changed the source appointment after the caller
  // confirmed its time. The old bare UPDATE would have overwritten it.
  it('maps a stale source appointment to conflict and syncs nothing', async () => {
    const mock = mockReschedule({ rpc: { data: 'conflict', error: null } })
    await useRescheduleMock(mock)

    const result = await rescheduleAppointmentByEmailServiceRole(
      'org-1',
      'appt-1',
      'ada@example.com',
      '2026-08-06T09:00:00.000Z',
      '2026-08-06T09:30:00.000Z',
      { startsAt: '2026-08-05T14:00:00+00:00' }
    )

    expect(result).toEqual({
      error: 'That appointment changed before we could move it. Please look it up again.',
      code: 'conflict',
    })

    const { handleAppointmentUpdated } = await import('@/lib/integrations/google-calendar-sync')
    expect(handleAppointmentUpdated).not.toHaveBeenCalled()
  })

  // Two callers both passed the same availability check. The second one loses
  // inside the transaction instead of double-booking the slot.
  it('maps destination contention to slot_taken and syncs nothing', async () => {
    const mock = mockReschedule({ rpc: { data: 'destination_conflict', error: null } })
    await useRescheduleMock(mock)

    const result = await rescheduleAppointmentByEmailServiceRole(
      'org-1',
      'appt-1',
      'ada@example.com',
      '2026-08-06T09:00:00.000Z',
      '2026-08-06T09:30:00.000Z'
    )

    expect(result).toEqual({ error: 'That time is no longer available.', code: 'slot_taken' })

    const { handleAppointmentUpdated } = await import('@/lib/integrations/google-calendar-sync')
    expect(handleAppointmentUpdated).not.toHaveBeenCalled()
  })

  it('maps a missing appointment to not_found', async () => {
    const mock = mockReschedule({ rpc: { data: 'not_found', error: null } })
    await useRescheduleMock(mock)

    expect(
      await rescheduleAppointmentByEmailServiceRole(
        'org-1',
        'appt-1',
        'ada@example.com',
        '2026-08-06T09:00:00.000Z',
        '2026-08-06T09:30:00.000Z'
      )
    ).toEqual({ error: 'Appointment not found.', code: 'not_found' })
  })

  it('returns update_failed on an rpc error or an unrecognized status', async () => {
    const failing = mockReschedule({ rpc: { data: null, error: { message: 'boom' } } })
    await useRescheduleMock(failing)
    expect(
      await rescheduleAppointmentByEmailServiceRole(
        'org-1',
        'appt-1',
        'ada@example.com',
        '2026-08-06T09:00:00.000Z',
        '2026-08-06T09:30:00.000Z'
      )
    ).toEqual({ error: 'Could not reschedule. Please try again.', code: 'update_failed' })

    const odd = mockReschedule({ rpc: { data: 'invalid_window', error: null } })
    await useRescheduleMock(odd)
    expect(
      await rescheduleAppointmentByEmailServiceRole(
        'org-1',
        'appt-1',
        'ada@example.com',
        '2026-08-06T09:30:00.000Z',
        '2026-08-06T09:00:00.000Z'
      )
    ).toEqual({ error: 'Could not reschedule. Please try again.', code: 'update_failed' })
  })

  it('never calls the function when the email does not own the appointment', async () => {
    const mock = mockReschedule({
      owner: { client_id: 'client-9', clients: { email: 'eve@example.com' } },
    })
    await useRescheduleMock(mock)

    expect(
      await rescheduleAppointmentByEmailServiceRole(
        'org-1',
        'appt-1',
        'ada@example.com',
        '2026-08-06T09:00:00.000Z',
        '2026-08-06T09:30:00.000Z'
      )
    ).toEqual({ error: 'Appointment not found.', code: 'not_found' })
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
