import { describe, it, expect, vi } from 'vitest'
import { enableIntegration, disableIntegration } from './actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

function mockSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  organizationId = 'org-1',
  upsertError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
} = {}) {
  const upsertResult = { error: upsertError }
  const upsert = vi.fn().mockReturnValue(upsertResult)

  const deleteEq2 = vi.fn().mockResolvedValue({ error: deleteError })
  const deleteEq1 = vi.fn().mockReturnValue({ eq: deleteEq2 })
  const del = vi.fn().mockReturnValue({ eq: deleteEq1 })

  const memberSingle = vi.fn().mockResolvedValue({
    data: user ? { organization_id: organizationId } : null,
  })
  const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return { select: memberSelect }
    }
    if (table === 'organization_integrations') {
      return { upsert, delete: del }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
    __mocks: { upsert, delete: del, memberEq },
  }
}

describe('enableIntegration', () => {
  it('returns a validation error for an empty slug', async () => {
    const result = await enableIntegration('')
    expect(result).toEqual({ error: 'Integration is required' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await enableIntegration('google-calendar')
    expect(result).toEqual({
      error: 'You must be signed in to enable an integration.',
    })
  })

  it('scopes the upsert to the correct organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await enableIntegration('google-calendar')

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        integration_slug: 'google-calendar',
        is_enabled: true,
      }),
      expect.objectContaining({ onConflict: 'organization_id,integration_slug' })
    )
  })
})

describe('disableIntegration', () => {
  it('returns a validation error for an empty slug', async () => {
    const result = await disableIntegration('')
    expect(result).toEqual({ error: 'Integration is required' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await disableIntegration('google-calendar')
    expect(result).toEqual({
      error: 'You must be signed in to disable an integration.',
    })
  })

  it('scopes the delete to the correct organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await disableIntegration('google-calendar')

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.delete).toHaveBeenCalled()
  })
})
