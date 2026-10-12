// @vitest-environment node
// Node rather than the global jsdom environment: this file constructs Next server primitives
// (NextRequest / NextResponse), which need Node's fetch globals.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import type { MfaGate } from '@/lib/auth/mfa'
import { proxy, config } from './proxy'

vi.mock('@/lib/supabase/middleware', () => ({ updateSession: vi.fn() }))

const AUTH_HEADERS = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
}

async function mockUpdateSession(mfa: MfaGate) {
  const { updateSession } = await import('@/lib/supabase/middleware')
  const response = NextResponse.next()
  response.cookies.set('sb-access-token', 'refreshed-token', { path: '/' })
  for (const [key, value] of Object.entries(AUTH_HEADERS)) {
    response.headers.set(key, value)
  }
  vi.mocked(updateSession).mockResolvedValue({ response, mfa, authHeaders: AUTH_HEADERS })
  return response
}

const PENDING: MfaGate = {
  state: 'pending',
  userId: 'u1',
  factorId: 'factor-1',
  email: 'owner@example.com',
}

function get(pathname: string) {
  return new NextRequest(new URL(pathname, 'https://app.example.com'))
}

function serverAction(pathname: string) {
  return new NextRequest(new URL(pathname, 'https://app.example.com'), {
    method: 'POST',
    headers: { 'Next-Action': '7f9c1a2b' },
  })
}

describe('proxy — pending MFA gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['/', '/settings', '/onboarding', '/analytics', '/conversations', '/agents/abc'])(
    'redirects a pending session away from %s',
    async (pathname) => {
      await mockUpdateSession(PENDING)

      const response = await proxy(get(pathname))

      // 303, not 307: a POST document navigation must follow up with a GET.
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('https://app.example.com/verify')
    }
  )

  it('redirects an indeterminate session too', async () => {
    await mockUpdateSession({ state: 'indeterminate' })

    const response = await proxy(get('/'))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://app.example.com/verify')
  })

  it.each(['/conversations', '/settings'])(
    'refuses a server-action POST to %s, so the action never runs',
    async (pathname) => {
      await mockUpdateSession(PENDING)

      const response = await proxy(serverAction(pathname))

      // Not a redirect status: a 307 made the browser re-POST the Next-Action header to /verify,
      // where the action does not exist, and the tab showed an action-resolution error. This is
      // the shape Next's own action client follows into a navigation.
      expect(response.headers.get('x-action-redirect')).toBe('/verify;replace')
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('Content-Type')).toBe('text/plain')
    }
  )

  it('answers a gated API fetch with 401 JSON rather than an HTML redirect', async () => {
    await mockUpdateSession(PENDING)

    const response = await proxy(get('/api/assistant'))

    expect(response.status).toBe(401)
    expect(response.headers.get('location')).toBeNull()
    await expect(response.json()).resolves.toEqual({
      error: 'Two-factor verification required.',
      verifyPath: '/verify',
    })
  })

  it('keeps the no-store headers on the API denial, so no proxy caches it', async () => {
    await mockUpdateSession(PENDING)

    const response = await proxy(get('/api/conversations/abc/recording'))

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })

  it('carries refreshed auth cookies and no-store headers onto the redirect', async () => {
    await mockUpdateSession(PENDING)

    const response = await proxy(get('/'))

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed-token')
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(response.headers.get('Pragma')).toBe('no-cache')
  })

  it.each(['/verify', '/login', '/smb/acme', '/manifest.webmanifest', '/llms.txt'])(
    'lets a pending session through to %s, so the gate cannot deadlock',
    async (pathname) => {
      const passthrough = await mockUpdateSession(PENDING)

      const response = await proxy(get(pathname))

      expect(response).toBe(passthrough)
      expect(response.status).not.toBe(303)
    }
  )

  it.each<MfaGate>([{ state: 'satisfied' }, { state: 'unauthenticated' }])(
    'passes a %j session through untouched',
    async (mfa) => {
      const passthrough = await mockUpdateSession(mfa)

      const response = await proxy(get('/'))

      expect(response).toBe(passthrough)
    }
  )

  it('still redirects when the pending session returns later to an abandoned flow', async () => {
    // Nothing expires and nothing is cleaned up: an aal1 session holding a verified factor stays
    // pending until it verifies or signs out, so coming back to / lands on /verify, not inside.
    await mockUpdateSession(PENDING)

    const first = await proxy(get('/'))
    const second = await proxy(get('/'))

    expect(first.headers.get('location')).toBe('https://app.example.com/verify')
    expect(second.headers.get('location')).toBe('https://app.example.com/verify')
  })

  it('carries refreshed cookies onto an action denial too', async () => {
    await mockUpdateSession(PENDING)

    const response = await proxy(serverAction('/conversations'))

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed-token')
  })
})

describe('proxy matcher', () => {
  it('runs on app routes and skips build output', () => {
    for (const url of [
      'https://app.example.com/',
      'https://app.example.com/settings',
      'https://app.example.com/api/assistant',
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
    }

    expect(
      unstable_doesMiddlewareMatch({ config, url: 'https://app.example.com/_next/static/chunk.js' })
    ).toBe(false)
  })
})
