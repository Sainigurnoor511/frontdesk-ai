import { describe, it, expect, vi } from 'vitest'
import { updateAppointment, cancelAppointment } from './actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/integrations/webhook', () => ({
  dispatchWebhook: vi.fn(),
}))

function mockSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  organizationId = 'org-1',
  updateError = null as { message: string } | null,
} = {}) {
  const updateEqOrg = vi.fn().mockResolvedValue({ error: updateError })
  const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg })
  const update = vi.fn().mockReturnValue({ eq: updateEqId })

  const memberSingle = vi.fn().mockResolvedValue({
    data: user ? { organization_id: organizationId } : null,
  })
  const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return { select: memberSelect }
    }
    if (table === 'appointments') {
      return { update }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
    __mocks: { update, updateEqId, updateEqOrg },
  }
}

const VALID_INPUT = {
  title: 'Consultation',
  clientName: 'Jane Doe',
  clientPhone: '+14155551234',
  startsAt: new Date('2026-08-04T09:00:00.000Z').toISOString(),
  endsAt: new Date('2026-08-04T10:00:00.000Z').toISOString(),
  notes: 'Follow-up',
  internalNotes: 'VIP',
}

describe('updateAppointment', () => {
  it('returns a validation error for an empty title', async () => {
    const result = await updateAppointment('appt-1', { ...VALID_INPUT, title: '' })
    expect(result).toEqual({ error: 'Title is required' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    const result = await updateAppointment('appt-1', VALID_INPUT)
    expect(result).toEqual({ error: 'You must be signed in to update an appointment.' })
  })

  it('scopes the update to the appointment id and caller organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateAppointment('appt-1', VALID_INPUT)

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Consultation',
        client_name: 'Jane Doe',
        client_phone: '+14155551234',
        starts_at: VALID_INPUT.startsAt,
        ends_at: VALID_INPUT.endsAt,
      })
    )
    expect(supabase.__mocks.updateEqId).toHaveBeenCalledWith('id', 'appt-1')
    expect(supabase.__mocks.updateEqOrg).toHaveBeenCalledWith('organization_id', 'org-42')
  })

  it('returns an error when the update fails', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ updateError: { message: 'boom' } }) as never
    )

    const result = await updateAppointment('appt-1', VALID_INPUT)
    expect(result).toEqual({ error: 'Could not update appointment. Please try again.' })
  })
})

describe('cancelAppointment', () => {
  it('marks the appointment cancelled scoped to the caller organization', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await cancelAppointment('appt-1')

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(supabase.__mocks.updateEqId).toHaveBeenCalledWith('id', 'appt-1')
    expect(supabase.__mocks.updateEqOrg).toHaveBeenCalledWith('organization_id', 'org-42')
  })
})
