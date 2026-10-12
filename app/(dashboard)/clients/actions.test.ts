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

async function mockSupabase(options: {
  factors?: unknown
  currentLevel?: string
  signedOut?: boolean
  organizationId?: string
}) {
  const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')

  // `filters` records every `.eq()` on the update and delete chains, so a test can assert the
  // write was scoped by both the row id and the caller's organization.
  const filters: [string, unknown][] = []
  const scoped = () => ({
    eq: (column: string, value: unknown) => {
      filters.push([column, value])
      return {
        eq: async (column2: string, value2: unknown) => {
          filters.push([column2, value2])
          return { error: null }
        },
      }
    },
  })
  const insert = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(scoped)
  const del = vi.fn(scoped)
  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { organization_id: options.organizationId ?? 'org-1' },
              error: null,
            }),
          }),
        }),
      }
    }
    return { insert, update, delete: del }
  })

  vi.mocked(createSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue(
        options.signedOut
          ? { data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } }
          : {
              data: { user: { id: 'u1', email: 'owner@example.com', factors: options.factors } },
              error: null,
            }
      ),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: options.currentLevel ?? 'aal1', nextLevel: null },
          error: null,
        }),
      },
    },
    from,
  } as never)

  return { from, insert, update, delete: del, filters }
}

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

describe('clients actions — validation, auth and organization scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an invalid phone number on create before touching Supabase', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')

    const result = await createClient({ ...VALID_CLIENT, phoneNumber: 'not-a-phone' })

    expect(result).toEqual({ error: 'Enter a valid phone number' })
    expect(createSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects an invalid phone number on update before touching Supabase', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')

    const result = await updateClient({ id: CLIENT_ID, ...VALID_CLIENT, phoneNumber: 'bad' })

    expect(result).toEqual({ error: 'Enter a valid phone number' })
    expect(createSupabaseClient).not.toHaveBeenCalled()
  })

  it.each([
    ['createClient', () => createClient(VALID_CLIENT), 'create'],
    ['updateClient', () => updateClient({ id: CLIENT_ID, ...VALID_CLIENT }), 'update'],
    ['deleteClient', () => deleteClient(CLIENT_ID), 'delete'],
  ] as const)('%s refuses a signed-out caller', async (_name, run, verb) => {
    const { from } = await mockSupabase({ signedOut: true })

    expect(await run()).toEqual({ error: `You must be signed in to ${verb} a client.` })
    expect(from).not.toHaveBeenCalled()
  })

  it('scopes the insert to the caller organization on success', async () => {
    const { insert } = await mockSupabase({ factors: [], organizationId: 'org-42' })

    const result = await createClient({ ...VALID_CLIENT, notes: 'VIP' })

    expect(result).toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith({
      organization_id: 'org-42',
      name: 'Ada Lovelace',
      phone_number: '+15551234567',
      email: 'ada@example.com',
      notes: 'VIP',
    })
  })

  it('updates the row by id within the caller organization', async () => {
    const { update, filters } = await mockSupabase({ factors: [], organizationId: 'org-42' })

    const result = await updateClient({ id: CLIENT_ID, ...VALID_CLIENT, email: '' })

    expect(result).toEqual({ success: true })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ada Lovelace', phone_number: '+15551234567', email: null })
    )
    expect(filters).toEqual([
      ['id', CLIENT_ID],
      ['organization_id', 'org-42'],
    ])
  })

  it('deletes the row by id within the caller organization', async () => {
    const { delete: del, filters } = await mockSupabase({ factors: [], organizationId: 'org-42' })

    const result = await deleteClient(CLIENT_ID)

    expect(result).toEqual({ success: true })
    expect(del).toHaveBeenCalled()
    expect(filters).toEqual([
      ['id', CLIENT_ID],
      ['organization_id', 'org-42'],
    ])
  })
})

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
