import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCurrentOrgAndUser } from './organization'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

async function mockSupabase(options: {
  factors?: unknown
  currentLevel?: string
  aalError?: boolean
}) {
  const { createClient } = await import('@/lib/supabase/server')
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: {
            role: 'owner',
            organization_id: 'org-1',
            organizations: { id: 'org-1', name: 'Acme' },
          },
          error: null,
        }),
      }),
    }),
  }))

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'u1', email: 'owner@example.com', factors: options.factors } },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue(
          options.aalError
            ? { data: null, error: { code: 'broken' } }
            : { data: { currentLevel: options.currentLevel ?? 'aal1', nextLevel: null }, error: null }
        ),
      },
    },
    from,
  } as never)

  return { from }
}

describe('getCurrentOrgAndUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the org context for a session with no two-factor requirement', async () => {
    await mockSupabase({ factors: [] })

    const context = await getCurrentOrgAndUser()

    expect(context).toEqual({
      user: { id: 'u1', email: 'owner@example.com', avatarUrl: null },
      org: { id: 'org-1', name: 'Acme' },
      role: 'owner',
    })
  })

  it('returns the org context once the session is elevated to aal2', async () => {
    await mockSupabase({ factors: [totpFactor], currentLevel: 'aal2' })

    expect(await getCurrentOrgAndUser()).not.toBeNull()
  })

  it('refuses a pending-MFA session before reading any organization data', async () => {
    const { from } = await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1' })

    expect(await getCurrentOrgAndUser()).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('refuses an indeterminate session, failing closed', async () => {
    const { from } = await mockSupabase({ factors: [totpFactor], aalError: true })

    expect(await getCurrentOrgAndUser()).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
})
