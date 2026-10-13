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

const nowSeconds = () => Math.floor(Date.now() / 1000)
const recoveryAmr = () => [{ method: 'recovery', timestamp: nowSeconds() }]

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

async function mockSupabase(
  options: {
    exchangeError?: boolean
    /** `amr` of the verified access token; defaults to an ordinary OAuth sign-in. */
    amr?: unknown
    /** `sub` of the verified access token; defaults to the signed-in user. */
    sub?: string
    /** `getClaims()` cannot be answered: it throws, or returns auth-js's retryable fetch error. */
    claimsBlip?: 'throws' | 'retryable'
    /** Session cookies the exchange writes through `setAll`. */
    sessionCookies?: { name: string; value: string; options: object }[]
  } = {}
) {
  const { createServerClient } = await import('@supabase/ssr')
  const { createServiceRoleClient } = await import('@/lib/supabase/server')
  vi.mocked(createServiceRoleClient).mockReturnValue(mockServiceClient() as never)

  const user = { id: 'u1', email: 'owner@example.com' }
  let setAll: ((cookies: unknown[]) => void) | undefined

  const client = {
    auth: {
      exchangeCodeForSession: vi.fn(async () => {
        if (options.exchangeError) {
          return { data: { user: null, session: null }, error: { message: 'bad code' } }
        }
        setAll?.(options.sessionCookies ?? [])
        return { data: { user, session: { access_token: 'issued.access.token' } }, error: null }
      }),
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
    },
  }
  vi.mocked(createServerClient).mockImplementation(((_url: string, _key: string, config: {
    cookies: { setAll: (cookies: unknown[]) => void }
  }) => {
    setAll = config.cookies.setAll
    return client
  }) as never)
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

  it('sends an ordinary sign-in to the dashboard without checking a recovery claim', async () => {
    const client = await mockSupabase()
    const response = await GET(callbackRequest('?code=abc'))
    expect(response.headers.get('location')).toBe('https://app.example.com/')
    expect(client.auth.getClaims).not.toHaveBeenCalled()
  })

  it('carries the session cookies the exchange set onto the redirect', async () => {
    await mockSupabase({
      amr: recoveryAmr(),
      sessionCookies: [{ name: 'sb-auth-token', value: 'session', options: { path: '/' } }],
    })
    const response = await GET(callbackRequest('?code=abc&flow=recovery'))
    expect(response.cookies.get('sb-auth-token')?.value).toBe('session')
  })

  it('sends a verified recovery link to /reset-password without setting a forgeable recovery cookie', async () => {
    const client = await mockSupabase({ amr: recoveryAmr() })
    const response = await GET(callbackRequest('?code=abc&flow=recovery'))
    expect(response.headers.get('location')).toBe('https://app.example.com/reset-password')
    expect(response.cookies.get('fd_password_recovery')).toBeUndefined()
    // The claim is read from the token the exchange just issued, verified by getClaims().
    expect(client.auth.getClaims).toHaveBeenCalledWith('issued.access.token')
  })

  it('sends an ordinary sign-in carrying ?flow=recovery to the dashboard, not to reset', async () => {
    // `flow=recovery` is a query parameter anyone can append to a callback. It used to pick
    // /reset-password and set the recovery cookie on its own.
    await mockSupabase()
    const response = await GET(callbackRequest('?code=abc&flow=recovery'))
    expect(response.headers.get('location')).toBe('https://app.example.com/')
    expect(response.cookies.get('fd_password_recovery')).toBeUndefined()
  })

  it('does not treat a stale recovery claim, or one for another user, as a reset', async () => {
    await mockSupabase({ amr: [{ method: 'recovery', timestamp: nowSeconds() - 60 * 60 }] })
    const stale = await GET(callbackRequest('?code=abc&flow=recovery'))
    expect(stale.headers.get('location')).toBe('https://app.example.com/')

    await mockSupabase({ amr: recoveryAmr(), sub: 'someone-else' })
    const otherUser = await GET(callbackRequest('?code=abc&flow=recovery'))
    expect(otherUser.headers.get('location')).toBe('https://app.example.com/')
  })

  it.each([
    ['getClaims() throws', 'throws' as const],
    ['getClaims() returns AuthRetryableFetchError', 'retryable' as const],
  ])('%s on a recovery link: to /reset-password, which re-checks the claim', async (_label, claimsBlip) => {
    // The PKCE code is spent by now, so routing this as an ordinary sign-in threw a real reset
    // link away. /reset-password and updatePassword re-check the signed claim, so this grants nothing.
    await mockSupabase({ claimsBlip })
    const response = await GET(callbackRequest('?code=abc&flow=recovery'))
    expect(response.headers.get('location')).toBe('https://app.example.com/reset-password')
    expect(response.cookies.get('fd_password_recovery')).toBeUndefined()
  })
})
