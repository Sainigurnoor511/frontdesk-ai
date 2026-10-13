// @vitest-environment node
// Node rather than the global jsdom environment: this file constructs Next server primitives
// (NextRequest / NextResponse), which need Node's fetch globals.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/lib/data/organization-slug', () => ({
  generateUniqueSlug: vi.fn(async () => 'acme'),
}))
vi.mock('@/lib/auth/mfa-attempts', () => ({
  clearAttemptsAfterRecovery: vi.fn(async () => 'cleared' as const),
}))

const nowSeconds = () => Math.floor(Date.now() / 1000)
const recoveryAmr = () => [{ method: 'recovery', timestamp: nowSeconds() }]

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

/** A service-role client whose member lookup always finds an existing membership. */
function mockServiceClient() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: 'member-1' }, error: null }) }),
      }),
    }),
  }
}

async function mockSupabase(options: {
  factors?: unknown
  currentLevel?: string
  exchangeError?: boolean
  /** `amr` of the verified access token; defaults to an ordinary OAuth sign-in. */
  amr?: unknown
  /** `sub` of the verified access token; defaults to the signed-in user. */
  sub?: string
  /** `getUser()` fails in transport, which the MFA gate reads as `indeterminate`. */
  getUserBlip?: boolean
  /** `getClaims()` cannot be answered: it throws, or returns auth-js's retryable fetch error. */
  claimsBlip?: 'throws' | 'retryable'
}) {
  const { createServerClient } = await import('@supabase/ssr')
  const { createServiceRoleClient } = await import('@/lib/supabase/server')
  vi.mocked(createServiceRoleClient).mockReturnValue(mockServiceClient() as never)

  const user = { id: 'u1', email: 'owner@example.com', factors: options.factors }
  const client = {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue(
        options.exchangeError
          ? { data: { user: null, session: null }, error: { message: 'bad code' } }
          : { data: { user, session: { access_token: 'issued.access.token' } }, error: null }
      ),
      getClaims:
        options.claimsBlip === 'throws'
          ? vi.fn().mockRejectedValue(new TypeError('fetch failed'))
          : options.claimsBlip === 'retryable'
            ? vi.fn().mockResolvedValue({
                data: null,
                error: { name: 'AuthRetryableFetchError', status: 503, message: 'upstream' },
              })
            : vi.fn().mockResolvedValue({
                data: {
                  claims: {
                    sub: options.sub ?? 'u1',
                    amr: options.amr ?? [{ method: 'oauth', timestamp: nowSeconds() }],
                  },
                  header: {},
                  signature: new Uint8Array(),
                },
                error: null,
              }),
      getUser: options.getUserBlip
        ? vi.fn().mockRejectedValue(new TypeError('fetch failed'))
        : vi.fn().mockResolvedValue({ data: { user }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: options.currentLevel ?? 'aal1', nextLevel: null },
          error: null,
        }),
      },
    },
  }
  vi.mocked(createServerClient).mockReturnValue(client as never)
  return client
}

function callbackRequest(query: string) {
  return new NextRequest(new URL(`/callback${query}`, 'https://app.example.com'))
}

describe('GET /callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuses a request with no code', async () => {
    const response = await GET(callbackRequest(''))

    expect(response.headers.get('location')).toBe('https://app.example.com/login?error=missing_code')
  })

  it('reports a failed exchange', async () => {
    await mockSupabase({ exchangeError: true })

    const response = await GET(callbackRequest('?code=abc'))

    expect(response.headers.get('location')).toBe('https://app.example.com/login?error=oauth_failed')
  })

  it('sends a Google sign-in with a verified TOTP factor to the challenge', async () => {
    await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1' })

    const response = await GET(callbackRequest('?code=abc'))

    expect(response.headers.get('location')).toBe('https://app.example.com/verify')
  })

  it('does not refill the attempt budget for a pending OAuth login', async () => {
    // The counter is server-side state keyed by user id, not a cookie. Clearing it on a fresh
    // first factor — which is exactly what an attacker holding the password has — was how the
    // five-attempt limit got reset indefinitely.
    const { clearAttemptsAfterRecovery } = await import('@/lib/auth/mfa-attempts')
    await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1' })

    const response = await GET(callbackRequest('?code=abc'))

    expect(response.headers.getSetCookie().join(';')).not.toContain('fd_mfa_attempts')
    expect(clearAttemptsAfterRecovery).not.toHaveBeenCalled()
  })

  it('sends a Google sign-in with no factors to the dashboard, as before', async () => {
    await mockSupabase({ factors: [] })

    const response = await GET(callbackRequest('?code=abc'))

    expect(response.headers.get('location')).toBe('https://app.example.com/')
  })

  it('sends a recovery link to /reset-password without setting a forgeable recovery cookie', async () => {
    await mockSupabase({ factors: [], amr: recoveryAmr() })

    const response = await GET(callbackRequest('?code=abc&flow=recovery'))

    expect(response.headers.get('location')).toBe('https://app.example.com/reset-password')
    expect(response.cookies.get('fd_password_recovery')).toBeUndefined()
  })

  describe('a verified recovery link', () => {
    it('without a factor: straight to /reset-password, no code prompt', async () => {
      await mockSupabase({ factors: [], amr: recoveryAmr() })

      const response = await GET(callbackRequest('?code=abc&flow=recovery'))

      expect(response.headers.get('location')).toBe('https://app.example.com/reset-password')
    })

    it('with a TOTP factor: through /verify first, because Supabase needs aal2 to change it', async () => {
      await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1', amr: recoveryAmr() })

      const response = await GET(callbackRequest('?code=abc&flow=recovery'))

      expect(response.headers.get('location')).toBe('https://app.example.com/verify')
    })

    it('on an indeterminate gate: to /reset-password, which re-resolves it, not to a dead-end /verify', async () => {
      // A getUser() blip makes the gate indeterminate. /verify has nothing to challenge for a
      // factorless session and the PKCE code is already spent, so sending it there burned the link.
      await mockSupabase({ factors: [], amr: recoveryAmr(), getUserBlip: true })

      const response = await GET(callbackRequest('?code=abc&flow=recovery'))

      expect(response.headers.get('location')).toBe('https://app.example.com/reset-password')
    })

    it('clears the attempt budget, so a locked-out owner gets back in without waiting', async () => {
      const { clearAttemptsAfterRecovery } = await import('@/lib/auth/mfa-attempts')
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const client = await mockSupabase({
        factors: [totpFactor],
        currentLevel: 'aal1',
        amr: recoveryAmr(),
      })

      await GET(callbackRequest('?code=abc&flow=recovery'))

      expect(clearAttemptsAfterRecovery).toHaveBeenCalledWith('u1')
      // The claim is read from the token the exchange just issued, verified by getClaims().
      expect(client.auth.getClaims).toHaveBeenCalledWith('issued.access.token')
      vi.mocked(console.warn).mockRestore()
    })

    it('still completes the reset flow when Redis fails during the clear', async () => {
      const { clearAttemptsAfterRecovery } = await import('@/lib/auth/mfa-attempts')
      vi.mocked(clearAttemptsAfterRecovery).mockRejectedValueOnce(new Error('ECONNREFUSED'))
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1', amr: recoveryAmr() })

      const response = await GET(callbackRequest('?code=abc&flow=recovery'))

      expect(response.headers.get('location')).toBe('https://app.example.com/verify')
      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })

  describe('a recovery claim that cannot be verified (an Auth blip)', () => {
    // The PKCE code is spent by now, so routing this as an ordinary sign-in threw a real reset
    // link away: the dashboard (no factor) or /verify (with one), and no way to reopen the link.
    // /reset-password and updatePassword re-check the signed claim, so sending it there grants
    // nothing, and the refill still waits for a verified claim.
    it.each([
      ['getClaims() throws', 'throws' as const, []],
      ['getClaims() returns AuthRetryableFetchError', 'retryable' as const, []],
      ['getClaims() throws, TOTP factor pending', 'throws' as const, [totpFactor]],
      ['getClaims() returns AuthRetryableFetchError, TOTP factor pending', 'retryable' as const, [totpFactor]],
    ])('%s: to /reset-password, budget untouched', async (_label, claimsBlip, factors) => {
      const { clearAttemptsAfterRecovery } = await import('@/lib/auth/mfa-attempts')
      await mockSupabase({ factors, currentLevel: 'aal1', claimsBlip })

      const response = await GET(callbackRequest('?code=abc&flow=recovery'))

      expect(response.headers.get('location')).toBe('https://app.example.com/reset-password')
      expect(clearAttemptsAfterRecovery).not.toHaveBeenCalled()
    })

    it('does not check the claim at all without ?flow=recovery, so an ordinary sign-in is unaffected', async () => {
      const client = await mockSupabase({ factors: [], claimsBlip: 'throws' })

      const response = await GET(callbackRequest('?code=abc'))

      expect(response.headers.get('location')).toBe('https://app.example.com/')
      expect(client.auth.getClaims).not.toHaveBeenCalled()
    })
  })

  it('does not clear the budget for ?flow=recovery on a sign-in that was not a recovery link', async () => {
    // `flow=recovery` is a query parameter anyone can append to an OAuth callback.
    const { clearAttemptsAfterRecovery } = await import('@/lib/auth/mfa-attempts')
    await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1' })

    const response = await GET(callbackRequest('?code=abc&flow=recovery'))

    expect(clearAttemptsAfterRecovery).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('https://app.example.com/verify')
  })

  it('sends an ordinary no-factor sign-in carrying ?flow=recovery to the dashboard, not to reset', async () => {
    // The unsigned parameter used to pick /reset-password on its own, which then refused the
    // ordinary session as an expired link: a successful sign-in turned into a dead end.
    const { clearAttemptsAfterRecovery } = await import('@/lib/auth/mfa-attempts')
    await mockSupabase({ factors: [] })

    const response = await GET(callbackRequest('?code=abc&flow=recovery'))

    expect(response.headers.get('location')).toBe('https://app.example.com/')
    expect(clearAttemptsAfterRecovery).not.toHaveBeenCalled()
  })

  it('does not clear the budget for a stale recovery claim or another user', async () => {
    const { clearAttemptsAfterRecovery } = await import('@/lib/auth/mfa-attempts')
    await mockSupabase({
      factors: [totpFactor],
      amr: [{ method: 'recovery', timestamp: nowSeconds() - 60 * 60 }],
    })
    await GET(callbackRequest('?code=abc&flow=recovery'))
    await mockSupabase({ factors: [totpFactor], amr: recoveryAmr(), sub: 'someone-else' })
    await GET(callbackRequest('?code=abc&flow=recovery'))

    expect(clearAttemptsAfterRecovery).not.toHaveBeenCalled()
  })
})
