import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient, updateClient, deleteClient } from './actions'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

/**
 * Representative coverage for the enforcement boundary on a *mutation* path.
 *
 * The gate originally landed on read helpers only, so every action that resolved its own caller
 * with a bare `supabase.auth.getUser()` plus `if (!user)` accepted a pending `aal1` session and
 * wrote to the database. These tests assert the side effect never happens — `from()` is not
 * called — rather than only that an error came back, because an error with the row already
 * written is exactly the bug.
 */

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

const VALID_CLIENT = {
  name: 'Ada Lovelace',
  phoneNumber: '+15551234567',
  email: 'ada@example.com',
  notes: '',
}

async function mockSupabase(options: { factors?: unknown; currentLevel?: string }) {
  const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')

  const insert = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) }))
  const del = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) }))
  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { organization_id: 'org-1' }, error: null }) }),
        }),
      }
    }
    return { insert, update, delete: del }
  })

  vi.mocked(createSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'u1', email: 'owner@example.com', factors: options.factors } },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: options.currentLevel ?? 'aal1', nextLevel: null },
          error: null,
        }),
      },
    },
    from,
  } as never)

  return { from, insert, update, delete: del }
}

describe('clients actions — pending-MFA session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuses createClient without inserting the row', async () => {
    const { from, insert } = await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1' })

    const result = await createClient(VALID_CLIENT)

    expect(result).toEqual({ error: 'You must be signed in to create a client.' })
    expect(from).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses updateClient without touching the table', async () => {
    const { from, update } = await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1' })

    const result = await updateClient({
      id: '11111111-1111-4111-8111-111111111111',
      ...VALID_CLIENT,
    })

    expect(result).toEqual({ error: 'You must be signed in to update a client.' })
    expect(from).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses deleteClient without deleting the row', async () => {
    const { from, delete: del } = await mockSupabase({
      factors: [totpFactor],
      currentLevel: 'aal1',
    })

    const result = await deleteClient('11111111-1111-4111-8111-111111111111')

    expect(result).toEqual({ error: 'You must be signed in to delete a client.' })
    expect(from).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('refuses an indeterminate session too, failing closed', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const from = vi.fn()
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', factors: [totpFactor] } },
          error: null,
        }),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockRejectedValue(new Error('gotrue down')),
        },
      },
      from,
    } as never)

    expect(await createClient(VALID_CLIENT)).toEqual({
      error: 'You must be signed in to create a client.',
    })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('clients actions — allowed sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the client once the session is elevated to aal2', async () => {
    const { insert } = await mockSupabase({ factors: [totpFactor], currentLevel: 'aal2' })

    expect(await createClient(VALID_CLIENT)).toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: 'org-1', name: 'Ada Lovelace' })
    )
  })

  it('creates the client for an account with no enrolled factor', async () => {
    const { insert } = await mockSupabase({ factors: [] })

    expect(await createClient(VALID_CLIENT)).toEqual({ success: true })
    expect(insert).toHaveBeenCalled()
  })
})
