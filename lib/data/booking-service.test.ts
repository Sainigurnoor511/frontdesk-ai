import { describe, it, expect, vi } from 'vitest'
import {
  checkAvailabilityServiceRole,
  findOrCreateClientServiceRole,
  createAppointmentServiceRole,
} from './booking-service'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

describe('checkAvailabilityServiceRole', () => {
  it('returns available when the range has no overlapping appointments', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const gt = vi.fn().mockResolvedValue({ data: [], error: null })
    const lt = vi.fn().mockReturnValue({ gt })
    const neq = vi.fn().mockReturnValue({ lt })
    const eq = vi.fn().mockReturnValue({ neq })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    const result = await checkAvailabilityServiceRole(
      'org-1',
      '2026-08-03T14:00:00Z',
      '2026-08-03T15:00:00Z'
    )

    expect(result.available).toBe(true)
    expect(result.conflicts).toEqual([])
    expect(from).toHaveBeenCalledWith('appointments')
    expect(eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(neq).toHaveBeenCalledWith('status', 'cancelled')
    expect(lt).toHaveBeenCalledWith('starts_at', '2026-08-03T15:00:00Z')
    expect(gt).toHaveBeenCalledWith('ends_at', '2026-08-03T14:00:00Z')
  })

  it('flags a conflicting appointment and ignores cancelled rows', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const gt = vi.fn().mockResolvedValue({
      data: [{ id: 'appt-1', title: 'Dentist visit', starts_at: 'x', ends_at: 'y', status: 'confirmed' }],
      error: null,
    })
    const lt = vi.fn().mockReturnValue({ gt })
    const neq = vi.fn().mockReturnValue({ lt })
    const eq = vi.fn().mockReturnValue({ neq })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    const result = await checkAvailabilityServiceRole(
      'org-1',
      '2026-08-03T14:00:00Z',
      '2026-08-03T15:00:00Z'
    )

    expect(result.available).toBe(false)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].title).toBe('Dentist visit')
  })

  it('throws when the query fails', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const gt = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const lt = vi.fn().mockReturnValue({ gt })
    const neq = vi.fn().mockReturnValue({ lt })
    const eq = vi.fn().mockReturnValue({ neq })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    await expect(
      checkAvailabilityServiceRole('org-1', 'a', 'b')
    ).rejects.toThrow('boom')
  })
})

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

  it('throws when no phone is available and no matching client exists', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const emailMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const emailEq = vi.fn().mockReturnValue({ maybeSingle: emailMaybeSingle })
    const orgEq = vi.fn().mockReturnValue({ eq: emailEq })
    const select = vi.fn().mockReturnValue({ eq: orgEq })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    await expect(
      findOrCreateClientServiceRole('org-1', {
        name: 'Ada Lovelace',
        phoneNumber: null,
        email: 'ada@example.com',
      })
    ).rejects.toThrow('phone number is required')
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
      status: 'confirmed',
    })
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
