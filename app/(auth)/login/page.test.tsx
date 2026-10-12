import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LoginPage from './page'

vi.mock('@/components/auth/login-form', () => ({ LoginForm: () => <div /> }))
vi.mock('@/components/auth/google-button', () => ({ GoogleButton: () => <div /> }))

afterEach(() => {
  cleanup()
})

async function renderWith(error?: string | string[]) {
  render(await LoginPage({ searchParams: Promise.resolve({ error }) }))
}

describe('LoginPage notices', () => {
  it.each([
    ['mfa_unavailable', /two-factor sign-in is unavailable/i],
    ['mfa_attempts', /too many incorrect codes/i],
    ['mfa_cancelled', /you're signed out/i],
    ['mfa_required', /enter your authentication code/i],
    ['session_expired', /session expired/i],
    ['missing_code', /sign-in link was incomplete/i],
    ['oauth_failed', /google sign-in did not complete/i],
    ['org_setup_failed', /could not finish setting up/i],
  ])('explains %s above the form', async (code, copy) => {
    await renderWith(code)

    expect(screen.getByRole('status').textContent).toMatch(copy)
  })

  it('renders nothing for an unknown or absent code, so the param cannot inject copy', async () => {
    await renderWith('<script>alert(1)</script>')
    expect(screen.queryByRole('status')).toBeNull()

    cleanup()
    await renderWith(undefined)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('reads the first value when the param repeats', async () => {
    await renderWith(['mfa_cancelled', 'oauth_failed'])

    expect(screen.getByRole('status').textContent).toMatch(/you're signed out/i)
  })

  it('tones a deliberate cancel as neutral and a failure as danger', async () => {
    await renderWith('mfa_cancelled')
    expect(screen.getByRole('status').className).toContain('bg-muted')

    cleanup()
    await renderWith('mfa_attempts')
    expect(screen.getByRole('status').className).toContain('bg-danger-subtle')
  })
})
