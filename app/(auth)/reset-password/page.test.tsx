import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import ResetPasswordPage from './page'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

// Every request sends the old `fd_password_recovery=1` cookie, which any client can forge, so the
// page has to refuse on the signed claim alone.
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    has: (name: string) => name === 'fd_password_recovery',
    get: (name: string) => (name === 'fd_password_recovery' ? { name, value: '1' } : undefined),
  })),
}))

// Marked, so a test can tell a client-side `<Link>` from the plain `<a>` the retry needs.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} data-next-link="" {...rest}>
      {children}
    </a>
  ),
}))

// The form is a client component with its own behaviour; the branches under test are the panels.
vi.mock('@/components/auth/reset-password-form', () => ({
  ResetPasswordForm: () => <div data-testid="reset-form" />,
}))

const nowSeconds = () => Math.floor(Date.now() / 1000)
const signedInUser = { id: 'u1', email: 'owner@example.com' }

const RETRY_HEADING = 'We could not check your reset link'
const EXPIRED_HEADING = 'This link has expired'

type Outcome = () => Promise<unknown>

const claimsWith = (amr: unknown[]): Outcome => async () => ({
  data: { claims: { sub: 'u1', amr }, header: {}, signature: new Uint8Array() },
  error: null,
})
const claimsValid = claimsWith([{ method: 'recovery', timestamp: nowSeconds() }])
const claimsOrdinary = claimsWith([{ method: 'password', timestamp: nowSeconds() }])
const claimsStale = claimsWith([{ method: 'recovery', timestamp: nowSeconds() - 16 * 60 }])

async function mockSupabase(options: { user: unknown; getClaims: Outcome }) {
  const { createClient } = await import('@/lib/supabase/server')
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.user }, error: null })),
      getClaims: vi.fn(options.getClaims),
    },
  } as never)
}

afterEach(() => {
  cleanup()
})

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render the form for an ordinary signed-in session', async () => {
    await mockSupabase({ user: signedInUser, getClaims: claimsOrdinary })
    render(await ResetPasswordPage())
    expect(screen.getByRole('heading').textContent).toBe(EXPIRED_HEADING)
    expect(screen.getByRole('link', { name: /from settings/i }).getAttribute('href')).toBe('/settings')
    expect(screen.queryByTestId('reset-form')).toBeNull()
  })

  it('does not render the form for a recovery sign-in older than 15 minutes', async () => {
    await mockSupabase({ user: signedInUser, getClaims: claimsStale })
    render(await ResetPasswordPage())
    expect(screen.getByRole('heading').textContent).toBe(EXPIRED_HEADING)
    expect(screen.queryByTestId('reset-form')).toBeNull()
  })

  it('renders the expired panel with no session', async () => {
    await mockSupabase({ user: null, getClaims: async () => ({ data: null, error: null }) })
    render(await ResetPasswordPage())
    expect(screen.getByRole('heading').textContent).toBe(EXPIRED_HEADING)
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe(
      '/forgot-password'
    )
  })

  it.each<[string, Outcome]>([
    ['getClaims() throws', async () => Promise.reject(new TypeError('fetch failed'))],
    [
      'getClaims() returns a retryable error',
      async () => ({
        data: null,
        error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' },
      }),
    ],
  ])('renders a retry panel, not "expired" and not the form, when %s', async (_label, getClaims) => {
    await mockSupabase({ user: signedInUser, getClaims })
    render(await ResetPasswordPage())
    expect(screen.getByRole('heading').textContent).toBe(RETRY_HEADING)
    expect(screen.queryByText(EXPIRED_HEADING)).toBeNull()
    expect(screen.queryByTestId('reset-form')).toBeNull()
    // A plain link, so it always re-runs the check on the server rather than hitting the router cache.
    const retry = screen.getByRole('link', { name: 'Try again' })
    expect(retry.getAttribute('href')).toBe('/reset-password')
    expect(retry.hasAttribute('data-next-link')).toBe(false)
  })

  it('offers the form to a verified, recent recovery session, naming the account', async () => {
    await mockSupabase({ user: signedInUser, getClaims: claimsValid })
    render(await ResetPasswordPage())
    expect(screen.getByTestId('reset-form')).toBeTruthy()
    expect(screen.getByText(/owner@example\.com/)).toBeTruthy()
  })
})
