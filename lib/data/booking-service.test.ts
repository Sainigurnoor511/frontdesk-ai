import { describe, it, expect, vi } from 'vitest'
import {
  findOrCreateClientServiceRole,
  createAppointmentServiceRole,
} from './booking-service'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
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
