import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MFA_VERIFY_PATH } from '@/lib/auth/mfa'
import ResetPasswordPage from './page'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
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
const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }
const signedInUser = (factors: unknown[] = []) => ({ id: 'u1', email: 'owner@example.com', factors })

const RETRY_HEADING = 'We could not check your reset link'
const EXPIRED_HEADING = 'This link has expired'

type Outcome = () => Promise<unknown>

const getUserOk = (user: unknown): Outcome => async () => ({ data: { user }, error: null })
const getUserThrows: Outcome = async () => Promise.reject(new TypeError('fetch failed'))
const getUserRetryable: Outcome = async () => ({
  data: { user: null },
  error: { name: 'AuthRetryableFetchError', status: 503, message: 'upstream' },
})
const getUserSessionMissing: Outcome = async () => ({
  data: { user: null },
  error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' },
})

const claimsWith = (amr: unknown[]): Outcome => async () => ({
  data: { claims: { sub: 'u1', amr }, header: {}, signature: new Uint8Array() },
  error: null,
})
/** A verified, recent recovery sign-in (verifiable from cached JWKS even while GoTrue is down). */
const claimsValid = claimsWith([{ method: 'recovery', timestamp: nowSeconds() }])
/** A verified token that is not a recovery sign-in. */
const claimsAbsent = claimsWith([{ method: 'password', timestamp: nowSeconds() }])
const claimsUnverifiable: Outcome = async () => Promise.reject(new TypeError('fetch failed'))

async function mockSupabase(options: {
  getUser: Outcome
  getClaims: Outcome
  aal?: Outcome
}) {
  const { createClient } = await import('@/lib/supabase/server')
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn(options.getUser),
      getClaims: vi.fn(options.getClaims),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(
          options.aal ?? (async () => ({ data: { currentLevel: 'aal1', nextLevel: null }, error: null }))
        ),
      },
    },
  } as never)
}

function codeLink() {
  return screen.queryByRole('link', { name: /two-factor code/i })
}

afterEach(() => {
  cleanup()
})

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('a user check that could not be made renders the retry panel, never a crash or "expired"', () => {
    it('getUser() throws', async () => {
      await mockSupabase({ getUser: getUserThrows, getClaims: claimsValid })

      render(await ResetPasswordPage())

      expect(screen.getByRole('heading').textContent).toBe(RETRY_HEADING)
      expect(screen.queryByTestId('reset-form')).toBeNull()
    })

    it('getUser() returns AuthRetryableFetchError', async () => {
      await mockSupabase({ getUser: getUserRetryable, getClaims: claimsValid })

      render(await ResetPasswordPage())

      expect(screen.getByRole('heading').textContent).toBe(RETRY_HEADING)
      expect(screen.queryByText(EXPIRED_HEADING)).toBeNull()
      expect(screen.queryByTestId('reset-form')).toBeNull()
    })
  })

  it('an unverifiable claim renders the retry panel, without the code link', async () => {
    await mockSupabase({ getUser: getUserOk(signedInUser()), getClaims: claimsUnverifiable })

    render(await ResetPasswordPage())

    expect(screen.getByRole('heading').textContent).toBe(RETRY_HEADING)
    expect(codeLink()).toBeNull()
  })

  it('a positively absent session renders the expired panel', async () => {
    await mockSupabase({ getUser: getUserSessionMissing, getClaims: claimsValid })

    render(await ResetPasswordPage())

    expect(screen.getByRole('heading').textContent).toBe(EXPIRED_HEADING)
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe(
      '/forgot-password'
    )
  })

  it('an absent claim renders the expired panel, pointing a signed-in user at Settings', async () => {
    await mockSupabase({ getUser: getUserOk(signedInUser()), getClaims: claimsAbsent })

    render(await ResetPasswordPage())

    expect(screen.getByRole('heading').textContent).toBe(EXPIRED_HEADING)
    expect(screen.getByRole('link', { name: /from settings/i }).getAttribute('href')).toBe('/settings')
    expect(screen.queryByTestId('reset-form')).toBeNull()
  })

  it.each<[string, Outcome, Outcome?]>([
    ['getUser() throws', getUserThrows],
    ['the AAL read throws', getUserOk(signedInUser([totpFactor])), async () => Promise.reject(new Error('down'))],
  ])('an indeterminate gate (%s) offers the code step as well as a retry', async (_label, getUser, aal) => {
    const { redirect } = await import('next/navigation')
    await mockSupabase({ getUser, getClaims: claimsValid, aal })

    render(await ResetPasswordPage())

    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getByRole('heading').textContent).toBe(RETRY_HEADING)
    expect(codeLink()?.getAttribute('href')).toBe(MFA_VERIFY_PATH)
  })

  it('"Try again" is a plain link, so it always re-runs the checks on the server', async () => {
    // A same-route `<Link>` can be answered from the router cache without re-rendering the page.
    await mockSupabase({ getUser: getUserThrows, getClaims: claimsValid })

    render(await ResetPasswordPage())

    const retry = screen.getByRole('link', { name: 'Try again' })
    expect(retry.getAttribute('href')).toBe('/reset-password')
    expect(retry.hasAttribute('data-next-link')).toBe(false)
  })

  it('sends a recovery session that still owes its code to the code step', async () => {
    const { redirect } = await import('next/navigation')
    await mockSupabase({ getUser: getUserOk(signedInUser([totpFactor])), getClaims: claimsValid })

    await ResetPasswordPage()

    expect(redirect).toHaveBeenCalledWith(MFA_VERIFY_PATH)
  })

  it('offers the form to a verified recovery session past the gate, naming the account', async () => {
    await mockSupabase({ getUser: getUserOk(signedInUser()), getClaims: claimsValid })

    render(await ResetPasswordPage())

    expect(screen.getByTestId('reset-form')).toBeTruthy()
    expect(screen.getByText(/owner@example\.com/)).toBeTruthy()
  })
})
