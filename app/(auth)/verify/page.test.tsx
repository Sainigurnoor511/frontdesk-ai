import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import VerifyPage from './page'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ cancelMfaChallenge: vi.fn() }))
// The code form is a client component with its own test file; the branches under test here are
// the three non-form ones.
vi.mock('@/components/auth/verify-code-form', () => ({
  VerifyCodeForm: () => <div data-testid="code-form" />,
}))

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

async function mockSupabase(options: {
  user?: unknown
  currentLevel?: string
  aalThrows?: boolean
}) {
  const { createClient } = await import('@/lib/supabase/server')
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.user ?? null },
        error: options.user ? null : { code: 'bad_jwt' },
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: options.aalThrows
          ? vi.fn().mockRejectedValue(new Error('gotrue down'))
          : vi.fn().mockResolvedValue({
              data: { currentLevel: options.currentLevel ?? 'aal1', nextLevel: null },
              error: null,
            }),
      },
    },
  } as never)
}

afterEach(() => {
  cleanup()
})

describe('VerifyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends an already-elevated session home rather than asking for a code again', async () => {
    const { redirect } = await import('next/navigation')
    await mockSupabase({
      user: { id: 'u1', email: 'owner@example.com', factors: [totpFactor] },
      currentLevel: 'aal2',
    })

    await VerifyPage()

    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('sends a session-less visitor to the sign-in form', async () => {
    const { redirect } = await import('next/navigation')
    await mockSupabase({})

    await VerifyPage()

    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('renders a terminal panel for an indeterminate gate, not a redirect loop', async () => {
    const { redirect } = await import('next/navigation')
    await mockSupabase({
      user: { id: 'u1', email: 'owner@example.com', factors: [totpFactor] },
      aalThrows: true,
    })

    render(await VerifyPage())

    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getByRole('heading').textContent).toMatch(/unavailable/i)
    expect(screen.getByRole('button', { name: /sign in again/i })).toBeTruthy()
    expect(screen.queryByTestId('code-form')).toBeNull()
  })

  it('explains an unsupported factor instead of the generic retry panel', async () => {
    // The generic panel's "Sign in again" led straight back here: the dead-end loop.
    const { redirect } = await import('next/navigation')
    await mockSupabase({
      user: {
        id: 'u1',
        email: 'owner@example.com',
        factors: [{ id: 'f-phone', factor_type: 'phone', status: 'verified' }],
      },
      currentLevel: 'aal1',
    })

    render(await VerifyPage())

    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getByRole('heading').textContent).toBe('This sign-in method is not supported')
    expect(screen.getByText(/only check authenticator app codes/i)).toBeTruthy()
    expect(screen.getByText(/person who runs your Frontdesk\.ai workspace/i)).toBeTruthy()
    expect(screen.queryByText(/sign in again to continue/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByTestId('code-form')).toBeNull()
  })

  it('keeps the generic retry copy for a transient failure', async () => {
    await mockSupabase({
      user: { id: 'u1', email: 'owner@example.com', factors: [totpFactor] },
      aalThrows: true,
    })

    render(await VerifyPage())

    expect(screen.getByText(/could not check your two-factor setup/i)).toBeTruthy()
    expect(screen.queryByText(/not supported/i)).toBeNull()
  })

  it('prompts a pending session for its code, naming the account', async () => {
    await mockSupabase({
      user: { id: 'u1', email: 'owner@example.com', factors: [totpFactor] },
      currentLevel: 'aal1',
    })

    render(await VerifyPage())

    expect(screen.getByTestId('code-form')).toBeTruthy()
    expect(screen.getByText(/owner@example\.com/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /use a different account/i })).toBeTruthy()
  })
})
