// @vitest-environment node
// Node rather than the global jsdom environment: this file constructs NextRequest, which needs
// Node's fetch globals. Same reason as `proxy.test.ts`.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { updateSession } from './middleware'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

async function mockServerClient(auth: Record<string, unknown>) {
  const { createServerClient } = await import('@supabase/ssr')
  vi.mocked(createServerClient).mockReturnValue({ auth } as never)
}

function request() {
  return new NextRequest(new URL('/', 'https://app.example.com'))
}

describe('updateSession — the gate the proxy consumes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails closed when getUser throws, so a GoTrue blip cannot admit a pending session', async () => {
    // This is the proxy's own path. `unauthenticated` is a pass-through state in `proxy.ts`, so
    // mapping a thrown check to it let a session that still owed a code reach the app — and the
    // mutation actions would not have re-checked. `indeterminate` is denied.
    await mockServerClient({
      getUser: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
    })

    const { mfa } = await updateSession(request())

    expect(mfa.state).toBe('indeterminate')
  })

  it('reports unauthenticated when there is genuinely no session', async () => {
    await mockServerClient({
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { code: 'bad_jwt' } }),
      mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
    })

    const { mfa } = await updateSession(request())

    expect(mfa.state).toBe('unauthenticated')
  })

  it('reports pending for a verified factor on an un-elevated session', async () => {
    await mockServerClient({
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'u1', email: 'owner@example.com', factors: [totpFactor] } },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi
          .fn()
          .mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }),
      },
    })

    const { mfa } = await updateSession(request())

    expect(mfa).toEqual({
      state: 'pending',
      userId: 'u1',
      factorId: 'factor-1',
      email: 'owner@example.com',
    })
  })
})
