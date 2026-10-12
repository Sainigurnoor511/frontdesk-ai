import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findOrCreateClientServiceRole,
  createAppointmentServiceRole,
  findClientAppointmentsByEmailServiceRole,
  getUpcomingAppointmentsByEmailServiceRole,
  cancelAppointmentByEmailServiceRole,
} from './booking-service'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/integrations/webhook', () => ({
  dispatchWebhook: vi.fn(),
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
  })
})

/** Two-query chain: `clients` narrowed by `ilike`, then `appointments` by `in`. */
function mockLookupClient(options: {
  clients?: { data: unknown; error: unknown }
  appointments?: { data: unknown; error: unknown }
}) {
  const ilike = vi
    .fn()
    .mockResolvedValue(options.clients ?? { data: [{ id: 'client-1', email: 'ada@example.com' }], error: null })
  const clientOrgEq = vi.fn().mockReturnValue({ ilike })
  const clientSelect = vi.fn().mockReturnValue({ eq: clientOrgEq })

  const limit = vi.fn().mockResolvedValue(options.appointments ?? { data: [], error: null })
  const order = vi.fn().mockReturnValue({ limit })
  const gte = vi.fn().mockReturnValue({ order })
  const inClientIds = vi.fn().mockReturnValue({ gte })
  const apptOrgEq = vi.fn().mockReturnValue({ in: inClientIds })
  const apptSelect = vi.fn().mockReturnValue({ eq: apptOrgEq })

  const from = vi.fn((table: string) =>
    table === 'clients' ? { select: clientSelect } : { select: apptSelect }
  )

  return { from, ilike, clientOrgEq, apptOrgEq, inClientIds, gte, limit, apptSelect }
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
    expect(mock.apptOrgEq).toHaveBeenCalledWith('organization_id', 'org-1')
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

    expect(mock.inClientIds).toHaveBeenCalledWith('client_id', ['client-1', 'client-2'])
  })

  it('short-circuits without an appointments query when no client matches', async () => {
    const mock = mockLookupClient({ clients: { data: [], error: null } })
    await useMock(mock)

    expect(await findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com')).toEqual([])
    expect(mock.apptSelect).not.toHaveBeenCalled()
  })

  it('defaults the row limit to 50 and honors an override', async () => {
    const first = mockLookupClient({})
    await useMock(first)
    await findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com')
    expect(first.limit).toHaveBeenCalledWith(50)

    const second = mockLookupClient({})
    await useMock(second)
    await findClientAppointmentsByEmailServiceRole('org-1', 'ada@example.com', {
      sinceIso: '2026-07-04T12:00:00.000Z',
      limit: 100,
    })
    expect(second.gte).toHaveBeenCalledWith('starts_at', '2026-07-04T12:00:00.000Z')
    expect(second.limit).toHaveBeenCalledWith(100)
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
    expect(mock.limit).toHaveBeenCalledWith(500)
  })

  it('absorbs a read failure into [] so the public booking page keeps working', async () => {
    const mock = mockLookupClient({ clients: { data: null, error: { message: 'boom' } } })
    await useMock(mock)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await getUpcomingAppointmentsByEmailServiceRole('org-1', 'ada@example.com')).toEqual([])
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })
})

describe('cancelAppointmentByEmailServiceRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockCancel(options: {
    owner?: unknown
    updateError?: { message: string } | null
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

    const updateOrgEq = vi.fn().mockResolvedValue({ error: options.updateError ?? null })
    const updateIdEq = vi.fn().mockReturnValue({ eq: updateOrgEq })
    const update = vi.fn().mockReturnValue({ eq: updateIdEq })

    const from = vi.fn().mockReturnValue({ select, update })
    return { from, update, updateOrgEq }
  }

  it('cancels and fires the webhook plus all four calendar cancel handlers', async () => {
    const mock = mockCancel({})
    await useMock(mock)

    const result = await cancelAppointmentByEmailServiceRole('org-1', 'appt-1', 'ada@example.com')

    expect(result).toEqual({ success: true })
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    )
    expect(mock.updateOrgEq).toHaveBeenCalledWith('organization_id', 'org-1')

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
})
