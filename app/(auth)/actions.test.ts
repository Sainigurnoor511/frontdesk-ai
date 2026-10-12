import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  signUp,
  signOutAllDevices,
  requestPasswordReset,
  updatePassword,
  logIn,
  verifyMfaChallenge,
  cancelMfaChallenge,
} from './actions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

const cookieStore = { has: vi.fn(), delete: vi.fn(), get: vi.fn(), set: vi.fn() }
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}))

describe('signUp', () => {
  it('returns validation error for invalid email', async () => {
    const result = await signUp({
      email: 'not-an-email',
      password: 'password123',
    })
    expect(result).toEqual({ error: 'Enter a valid email address' })
  })
})

describe('signOutAllDevices', () => {
  it('signs out with global scope and redirects to login', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const { redirect } = await import('next/navigation')
    const signOut = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createSupabaseClient).mockResolvedValue({ auth: { signOut } } as never)

    await signOutAllDevices()

    expect(signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(redirect).toHaveBeenCalledWith('/login')
  })
})

describe('requestPasswordReset', () => {
  it('returns a validation error for an invalid email', async () => {
    const result = await requestPasswordReset({ email: 'nope' })
    expect(result).toEqual({ error: 'Enter a valid email address' })
  })

  it('sends the recovery email through the callback recovery flow', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createSupabaseClient).mockResolvedValue({ auth: { resetPasswordForEmail } } as never)

    const result = await requestPasswordReset({ email: 'owner@example.com' })

    expect(result).toEqual({ success: true })
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'owner@example.com',
      expect.objectContaining({ redirectTo: expect.stringMatching(/\/callback\?flow=recovery$/) })
    )
  })

  it('reports success even when the provider errors, so emails cannot be enumerated', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: { message: 'User not found' } })
    vi.mocked(createSupabaseClient).mockResolvedValue({ auth: { resetPasswordForEmail } } as never)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await requestPasswordReset({ email: 'stranger@example.com' })

    expect(result).toEqual({ success: true })
    consoleError.mockRestore()
  })
})

describe('updatePassword', () => {
  it('rejects mismatched passwords', async () => {
    const result = await updatePassword({ password: 'longenough1', confirmPassword: 'different1' })
    expect(result).toEqual({ error: 'Passwords do not match' })
  })

  it('refuses a signed-in user who did not arrive from a reset link', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const updateUser = vi.fn()
    cookieStore.has.mockReturnValue(false)
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }), updateUser },
    } as never)

    const result = await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })

    expect(result).toEqual({ error: 'This reset link has expired. Request a new one.' })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses when there is no recovery session', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const updateUser = vi.fn()
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }), updateUser },
    } as never)

    const result = await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })

    expect(result).toEqual({ error: 'This reset link has expired. Request a new one.' })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('updates the password and redirects home', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const { redirect } = await import('next/navigation')
    cookieStore.has.mockReturnValue(true)
    const updateUser = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }), updateUser },
    } as never)

    await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })

    expect(updateUser).toHaveBeenCalledWith({ password: 'longenough1' })
    expect(cookieStore.delete).toHaveBeenCalledWith('fd_password_recovery')
    expect(redirect).toHaveBeenCalledWith('/')
  })
})

// The `redirect` mock above is a non-throwing vi.fn() shared with the signOutAllDevices test, so
// these assertions are ordinal: `toHaveBeenNthCalledWith(1, ...)` plus `toHaveBeenCalledTimes(1)`
// fail an implementation that falls through to a second redirect, which a plain
// "was called with" check would let pass.

const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

type MfaClientOptions = {
  factors?: unknown
  currentLevel?: string | null
  aalError?: boolean
  signInError?: { message: string }
  challenge?: ReturnType<typeof vi.fn>
  verify?: ReturnType<typeof vi.fn>
  getUserError?: boolean
}

function mockAuthClient(options: MfaClientOptions) {
  const signInWithPassword = vi.fn().mockResolvedValue({ error: options.signInError ?? null })
  const getUser = vi.fn().mockResolvedValue(
    options.getUserError
      ? { data: { user: null }, error: { code: 'bad_jwt' } }
      : {
          data: { user: { id: 'u1', email: 'owner@example.com', factors: options.factors } },
          error: null,
        }
  )
  const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue(
    options.aalError
      ? { data: null, error: { code: 'broken' } }
      : { data: { currentLevel: options.currentLevel ?? 'aal1', nextLevel: null }, error: null }
  )
  const signOut = vi.fn().mockResolvedValue({ error: null })
  const challenge = options.challenge ?? vi.fn()
  const verify = options.verify ?? vi.fn()

  return {
    client: {
      auth: {
        signInWithPassword,
        getUser,
        signOut,
        mfa: { getAuthenticatorAssuranceLevel, challenge, verify },
      },
    },
    signInWithPassword,
    getAuthenticatorAssuranceLevel,
    signOut,
    challenge,
    verify,
  }
}

async function useAuthClient(options: MfaClientOptions) {
  const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
  const mocks = mockAuthClient(options)
  vi.mocked(createSupabaseClient).mockResolvedValue(mocks.client as never)
  return mocks
}

describe('logIn', () => {
  beforeEach(async () => {
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockClear()
    cookieStore.delete.mockClear()
    cookieStore.set.mockClear()
    cookieStore.get.mockReset()
  })

  it('returns friendly copy for bad credentials and does not redirect', async () => {
    const { redirect } = await import('next/navigation')
    await useAuthClient({ signInError: { message: 'Invalid login credentials' } })

    const result = await logIn({ email: 'owner@example.com', password: 'wrong' })

    expect(result).toEqual({ error: 'Incorrect email or password.' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('sends a user with no TOTP factor straight to the dashboard, with no assurance-level read', async () => {
    const { redirect } = await import('next/navigation')
    const { getAuthenticatorAssuranceLevel } = await useAuthClient({ factors: [] })

    await logIn({ email: 'owner@example.com', password: 'password123' })

    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenNthCalledWith(1, '/')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('redirects a user with a verified TOTP factor to the challenge, not the dashboard', async () => {
    const { redirect } = await import('next/navigation')
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1' })

    await logIn({ email: 'owner@example.com', password: 'password123' })

    expect(redirect).toHaveBeenNthCalledWith(1, '/verify')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('clears the attempt counter when a new pending login begins', async () => {
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1' })

    await logIn({ email: 'owner@example.com', password: 'password123' })

    expect(cookieStore.delete).toHaveBeenCalledWith('fd_mfa_attempts')
  })

  it('signs out and reports unavailability when the assurance level cannot be read', async () => {
    const { redirect } = await import('next/navigation')
    const { signOut } = await useAuthClient({
      factors: [totpFactor],
      aalError: true,
    })

    await logIn({ email: 'owner@example.com', password: 'password123' })

    expect(signOut).toHaveBeenCalled()
    expect(redirect).toHaveBeenNthCalledWith(1, '/login?error=mfa_unavailable')
    expect(redirect).toHaveBeenCalledTimes(1)
  })
})

describe('verifyMfaChallenge', () => {
  beforeEach(async () => {
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockClear()
    cookieStore.delete.mockClear()
    cookieStore.set.mockClear()
    cookieStore.get.mockReset()
  })

  it('rejects a malformed code without calling Supabase', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockClear()

    const result = await verifyMfaChallenge({ code: '12345' })

    expect(result).toEqual({ error: 'Enter the 6-digit code from your authenticator app' })
    expect(createSupabaseClient).not.toHaveBeenCalled()
  })

  it('challenges then verifies with the server-provided factor id and completes the login', async () => {
    const { redirect } = await import('next/navigation')
    const challenge = vi.fn().mockResolvedValue({ data: { id: 'challenge-9' }, error: null })
    const verify = vi.fn().mockResolvedValue({ data: {}, error: null })
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1', challenge, verify })

    await verifyMfaChallenge({ code: '123456' })

    expect(challenge).toHaveBeenCalledWith({ factorId: 'factor-1' })
    expect(verify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      challengeId: 'challenge-9',
      code: '123456',
    })
    expect(cookieStore.delete).toHaveBeenCalledWith('fd_mfa_attempts')
    expect(redirect).toHaveBeenNthCalledWith(1, '/')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('rejects a wrong code, stays put, and bumps the counter', async () => {
    const { redirect } = await import('next/navigation')
    const challenge = vi.fn().mockResolvedValue({ data: { id: 'challenge-9' }, error: null })
    const verify = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'mfa_verification_failed', status: 400 } })
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1', challenge, verify })

    const result = await verifyMfaChallenge({ code: '000000' })

    expect(result).toEqual({
      error: 'That code is not right. Check your authenticator app and try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
    expect(cookieStore.set).toHaveBeenCalledWith(
      'fd_mfa_attempts',
      '1',
      expect.objectContaining({ httpOnly: true })
    )
  })

  it('reports an expired challenge with copy distinct from the wrong-code copy', async () => {
    const challenge = vi.fn().mockResolvedValue({ data: { id: 'challenge-9' }, error: null })
    const verify = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'mfa_challenge_expired', status: 400 } })
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1', challenge, verify })

    const result = await verifyMfaChallenge({ code: '123456' })

    expect(result).toEqual({ error: 'That code expired. Enter the current code from your app.' })
  })

  it('surfaces Supabase throttling without advancing the counter', async () => {
    const challenge = vi.fn().mockResolvedValue({ data: { id: 'challenge-9' }, error: null })
    const verify = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'over_request_rate_limit', status: 429 } })
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1', challenge, verify })

    const result = await verifyMfaChallenge({ code: '123456' })

    expect(result).toEqual({
      error: 'Too many attempts. Please wait a few minutes and try again.',
    })
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('ends the pending session on the fifth counted failure', async () => {
    const { redirect } = await import('next/navigation')
    cookieStore.get.mockReturnValue({ value: '4' })
    const challenge = vi.fn().mockResolvedValue({ data: { id: 'challenge-9' }, error: null })
    const verify = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'mfa_verification_failed', status: 400 } })
    const { signOut } = await useAuthClient({
      factors: [totpFactor],
      currentLevel: 'aal1',
      challenge,
      verify,
    })

    await verifyMfaChallenge({ code: '000000' })

    expect(signOut).toHaveBeenCalled()
    expect(cookieStore.delete).toHaveBeenCalledWith('fd_mfa_attempts')
    expect(redirect).toHaveBeenNthCalledWith(1, '/login?error=mfa_attempts')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the factor disappeared mid-flow, without retrying verify', async () => {
    const { redirect } = await import('next/navigation')
    const challenge = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'mfa_factor_not_found', status: 404 } })
    const verify = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { signOut } = await useAuthClient({
      factors: [totpFactor],
      currentLevel: 'aal1',
      challenge,
      verify,
    })

    await verifyMfaChallenge({ code: '123456' })

    expect(verify).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalled()
    expect(redirect).toHaveBeenNthCalledWith(1, '/login?error=mfa_unavailable')
    expect(redirect).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('sends a vanished session back to login without challenging', async () => {
    const { redirect } = await import('next/navigation')
    const { challenge } = await useAuthClient({ getUserError: true })

    await verifyMfaChallenge({ code: '123456' })

    expect(challenge).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenNthCalledWith(1, '/login?error=session_expired')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('sends an already-elevated session home without challenging', async () => {
    const { redirect } = await import('next/navigation')
    const { challenge } = await useAuthClient({ factors: [totpFactor], currentLevel: 'aal2' })

    await verifyMfaChallenge({ code: '123456' })

    expect(challenge).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenNthCalledWith(1, '/')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('ends the session when the gate is indeterminate, without challenging', async () => {
    const { redirect } = await import('next/navigation')
    const { challenge, signOut } = await useAuthClient({ factors: [totpFactor], aalError: true })

    await verifyMfaChallenge({ code: '123456' })

    expect(challenge).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalled()
    expect(redirect).toHaveBeenNthCalledWith(1, '/login?error=mfa_unavailable')
    expect(redirect).toHaveBeenCalledTimes(1)
  })
})

describe('cancelMfaChallenge', () => {
  beforeEach(async () => {
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockClear()
    cookieStore.delete.mockClear()
  })

  it('signs the pending session out, clears the counter, and returns to login', async () => {
    const { redirect } = await import('next/navigation')
    const { signOut } = await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1' })

    await cancelMfaChallenge()

    expect(signOut).toHaveBeenCalled()
    expect(cookieStore.delete).toHaveBeenCalledWith('fd_mfa_attempts')
    expect(redirect).toHaveBeenNthCalledWith(1, '/login?error=mfa_cancelled')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('still ends the session when signOut rejects', async () => {
    const { redirect } = await import('next/navigation')
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const signOut = vi.fn().mockRejectedValue(new Error('network down'))
    vi.mocked(createSupabaseClient).mockResolvedValue({ auth: { signOut } } as never)

    await cancelMfaChallenge()

    expect(redirect).toHaveBeenNthCalledWith(1, '/login?error=mfa_cancelled')
  })
})
