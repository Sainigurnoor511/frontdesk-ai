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
}) {
  const { createServerClient } = await import('@supabase/ssr')
  const { createServiceRoleClient } = await import('@/lib/supabase/server')
  vi.mocked(createServiceRoleClient).mockReturnValue(mockServiceClient() as never)

  const user = { id: 'u1', email: 'owner@example.com', factors: options.factors }
  const client = {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue(
        options.exchangeError
          ? { data: { user: null }, error: { message: 'bad code' } }
          : { data: { user }, error: null }
      ),
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
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
    await mockSupabase({ factors: [totpFactor], currentLevel: 'aal1' })

    const response = await GET(callbackRequest('?code=abc'))

    expect(response.headers.getSetCookie().join(';')).not.toContain('fd_mfa_attempts')
  })

  it('sends a Google sign-in with no factors to the dashboard, as before', async () => {
    await mockSupabase({ factors: [] })

    const response = await GET(callbackRequest('?code=abc'))

    expect(response.headers.get('location')).toBe('https://app.example.com/')
  })

  it('sends a recovery link to /reset-password without setting a forgeable recovery cookie', async () => {
    await mockSupabase({ factors: [] })

    const response = await GET(callbackRequest('?code=abc&flow=recovery'))

    expect(response.headers.get('location')).toBe('https://app.example.com/reset-password')
    expect(response.cookies.get('fd_password_recovery')).toBeUndefined()
  })
})
