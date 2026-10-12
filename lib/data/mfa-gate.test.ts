import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * One shared assertion for every gated read helper: a pending-MFA session must be refused
 * *before* any table is touched. `from()` never being called is the shape that catches a guard
 * placed after the query, which an "returns empty" assertion would pass.
 *
 * `lib/data/organization.test.ts` covers `getCurrentOrgAndUser` in more detail; it is included
 * here too so the list is the whole gated surface rather than a subset.
 */

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn() }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/lib/voice/recording', () => ({ getEgressRecordingForRoom: vi.fn() }))

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

async function mockSupabase(options: { factors?: unknown; currentLevel?: string }) {
  const { createClient } = await import('@/lib/supabase/server')
  const from = vi.fn()

  vi.mocked(createClient).mockResolvedValue({
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

  return { from }
}

const helpers: [name: string, call: () => Promise<unknown>][] = [
  ['getClientsForOrg', async () => (await import('./clients')).getClientsForOrg()],
  ['getConversationsForOrg', async () => (await import('./conversations')).getConversationsForOrg()],
  [
    'getConversationNavCounts',
    async () => (await import('./conversations')).getConversationNavCounts(),
  ],
  ['getConversationById', async () => (await import('./conversations')).getConversationById('c1')],
  [
    'getCallerMessagesForOrg',
    async () => (await import('./conversations')).getCallerMessagesForOrg(),
  ],
  [
    'getConversationRecordingUrl',
    async () => (await import('./conversations')).getConversationRecordingUrl('c1'),
  ],
  [
    'getEnabledIntegrationsForOrg',
    async () => (await import('./integrations')).getEnabledIntegrationsForOrg(),
  ],
  ['getCurrentOrgAndUser', async () => (await import('./organization')).getCurrentOrgAndUser()],
  ['getPhoneNumbersForOrg', async () => (await import('./phone-numbers')).getPhoneNumbersForOrg()],
  [
    'getHiddenSidebarItems',
    async () => (await import('./sidebar-preferences')).getHiddenSidebarItems('org-1'),
  ],
  ['getStaffForOrg', async () => (await import('./staff')).getStaffForOrg()],
]

describe('gated read helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(helpers)('%s refuses a pending session before any query', async (_name, call) => {
    const { from } = await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1' })

    await call()

    expect(from).not.toHaveBeenCalled()
  })

  it.each(helpers)('%s refuses an indeterminate session', async (_name, call) => {
    const { createClient } = await import('@/lib/supabase/server')
    const from = vi.fn()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'u1', factors: [totpFactor] } }, error: null }),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockRejectedValue(new Error('gotrue down')),
        },
      },
      from,
    } as never)

    await call()

    expect(from).not.toHaveBeenCalled()
  })

  it.each(helpers)('%s proceeds to query for an elevated session', async (_name, call) => {
    // The counter-test: without it, a helper that refused everything would pass the two above.
    const { from } = await mockSupabase({ factors: [totpFactor], currentLevel: 'aal2' })
    from.mockImplementation(() => {
      throw new Error('reached the query')
    })

    // `getConversationNavCounts` swallows its own errors, so the assertion is on the call, not on
    // the rejection.
    await call().catch(() => undefined)

    expect(from).toHaveBeenCalled()
  })
})
