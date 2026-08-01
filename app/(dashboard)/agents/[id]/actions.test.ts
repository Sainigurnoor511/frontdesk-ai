import { describe, it, expect, vi } from 'vitest'
import { updateAgentGeneral, updateAgentCallSettings } from './actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

const AGENT_ID = '11111111-1111-1111-1111-111111111111'

function mockSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  organizationId = 'org-1',
  updateError = null as { message: string } | null,
} = {}) {
  const updateEq2 = vi.fn().mockResolvedValue({ error: updateError })
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
  const update = vi.fn().mockReturnValue({ eq: updateEq1 })

  const memberSingle = vi.fn().mockResolvedValue({
    data: user ? { organization_id: organizationId } : null,
  })
  const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return { select: memberSelect }
    }
    if (table === 'agents') {
      return { update }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
    __mocks: { update, updateEq1, updateEq2 },
  }
}

describe('updateAgentGeneral', () => {
  it('returns a validation error when additional instructions exceed the max length', async () => {
    const result = await updateAgentGeneral(AGENT_ID, {
      additionalInstructions: 'a'.repeat(8001),
    })
    expect('error' in result && result.error).toBeTruthy()
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    const result = await updateAgentGeneral(AGENT_ID, {
      voiceId: 'default-neutral',
    })
    expect(result).toEqual({ error: 'You must be signed in to update this receptionist.' })
  })

  it('scopes the update to the caller organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateAgentGeneral(AGENT_ID, {
      voiceId: 'warm-friendly',
      defaultLanguage: 'English',
      additionalInstructions: 'Be nice',
      toneTraits: ['Friendly', 'Warm'],
      firstMessage: 'Hello!',
    })

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_id: 'warm-friendly',
        language: 'English',
        additional_instructions: 'Be nice',
        tone_traits: ['Friendly', 'Warm'],
        first_message: 'Hello!',
      })
    )
    expect(supabase.__mocks.updateEq1).toHaveBeenCalledWith('id', AGENT_ID)
    expect(supabase.__mocks.updateEq2).toHaveBeenCalledWith('organization_id', 'org-42')
  })

  it("cannot update another organization's agent (org-scoped where clause)", async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-1' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    await updateAgentGeneral(AGENT_ID, { voiceId: 'default-neutral' })

    // The update is always scoped by both the target agent id and the caller's
    // organization_id, so Supabase RLS/filtering prevents cross-org writes.
    expect(supabase.__mocks.updateEq1).toHaveBeenCalledWith('id', AGENT_ID)
    expect(supabase.__mocks.updateEq2).toHaveBeenCalledWith('organization_id', 'org-1')
  })
})

describe('updateAgentCallSettings', () => {
  it('returns a validation error for an invalid phone number', async () => {
    const result = await updateAgentCallSettings(AGENT_ID, {
      answeringMode: 'staff_first',
      staffPhoneNumber: 'not-a-phone',
      maxRingSeconds: 20,
    })
    expect(result).toEqual({ error: 'Enter a valid phone number' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(mockSupabase({ user: null }) as never)

    const result = await updateAgentCallSettings(AGENT_ID, {
      answeringMode: 'staff_first',
      staffPhoneNumber: '+14155551234',
      maxRingSeconds: 20,
    })
    expect(result).toEqual({ error: 'You must be signed in to update this receptionist.' })
  })

  it('scopes the update to the caller organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await updateAgentCallSettings(AGENT_ID, {
      answeringMode: 'agent_first',
      staffPhoneNumber: '+14155551234',
      maxRingSeconds: 30,
      holdMusic: 'jazz',
    })

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        answering_mode: 'agent_first',
        staff_phone_number: '+14155551234',
        max_ring_seconds: 30,
        hold_music: 'jazz',
      })
    )
    expect(supabase.__mocks.updateEq1).toHaveBeenCalledWith('id', AGENT_ID)
    expect(supabase.__mocks.updateEq2).toHaveBeenCalledWith('organization_id', 'org-42')
  })
})
