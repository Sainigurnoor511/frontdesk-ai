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

// The attempt budget is Redis-backed server state, so the unit tests drive it directly rather
// than through a cookie the requester could have forged. The Redis side, including the atomic
// script, is covered against real connections in lib/auth/mfa-attempts.test.ts.
vi.mock('@/lib/auth/mfa-attempts', () => ({
  reserveAttempt: vi.fn(async () => ({ status: 'reserved', attempts: 1 })),
  releaseAttempt: vi.fn(async () => {}),
  clearAttempts: vi.fn(async () => {}),
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

  const nowSeconds = () => Math.floor(Date.now() / 1000)

  /**
   * A signed-in client whose verified token carries `amr`. `getUser` succeeds for every case, so
   * the only thing separating a refusal from a password change is the recovery proof.
   */
  async function useRecoveryClient(
    claims: { amr?: unknown } | { error: string; name?: string },
    session: { factors?: unknown; currentLevel?: string; aalError?: boolean } = {}
  ) {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const updateUser = vi.fn().mockResolvedValue({ error: null })
    const getClaims = vi.fn().mockResolvedValue(
      'error' in claims
        ? { data: null, error: { name: claims.name ?? 'AuthInvalidJwtError', message: claims.error } }
        : { data: { claims: { sub: 'u1', ...claims }, header: {}, signature: new Uint8Array() }, error: null }
    )
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', factors: session.factors } },
          error: null,
        }),
        getClaims,
        updateUser,
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue(
            session.aalError
              ? { data: null, error: { name: 'AuthRetryableFetchError', message: 'fetch failed' } }
              : { data: { currentLevel: session.currentLevel ?? 'aal1', nextLevel: null }, error: null }
          ),
        },
      },
    } as never)
    return { updateUser, getClaims }
  }

  const retry = {
    error:
      'We could not confirm your reset link just now. Your password was not changed. Please try again in a moment.',
  }

  const expired = { error: 'This reset link has expired. Request a new one.' }

  it('refuses a forged recovery cookie on a session with no verified recovery claim', async () => {
    // The pre-fix exploit: `fd_password_recovery=1` was unsigned and bound to nothing, so any
    // signed-in session could send it and change the password without ever opening a reset link.
    cookieStore.has.mockReturnValue(true)
    cookieStore.get.mockReturnValue({ name: 'fd_password_recovery', value: '1' })
    const { updateUser } = await useRecoveryClient({
      amr: [{ method: 'password', timestamp: nowSeconds() }],
    })

    const result = await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })

    expect(result).toEqual(expired)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses an ordinary aal1 session with no recovery marker', async () => {
    cookieStore.has.mockReturnValue(false)
    const { updateUser } = await useRecoveryClient({
      amr: [{ method: 'password', timestamp: nowSeconds() }],
    })

    expect(
      await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })
    ).toEqual(expired)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses an ordinary aal2 session with no recovery marker', async () => {
    const { updateUser } = await useRecoveryClient({
      amr: [
        { method: 'totp', timestamp: nowSeconds() },
        { method: 'password', timestamp: nowSeconds() - 30 },
      ],
    })

    expect(
      await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })
    ).toEqual(expired)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses a recovery sign-in older than the recovery window', async () => {
    const { updateUser } = await useRecoveryClient({
      amr: [{ method: 'recovery', timestamp: nowSeconds() - 16 * 60 }],
    })

    expect(
      await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })
    ).toEqual(expired)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses when the token does not verify', async () => {
    const { updateUser } = await useRecoveryClient({ error: 'Invalid JWT signature' })

    expect(
      await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })
    ).toEqual(expired)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses, without calling the link expired, when the auth server cannot verify the token', async () => {
    const { updateUser } = await useRecoveryClient({
      error: 'fetch failed',
      name: 'AuthRetryableFetchError',
    })

    expect(
      await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })
    ).toEqual(retry)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('returns a retryable error on an indeterminate gate instead of a silent bounce via /verify', async () => {
    // /verify sends a factorless or unreadable session home with no message, so the user believed
    // the password had changed when it had not.
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockClear()
    const { updateUser } = await useRecoveryClient(
      { amr: [{ method: 'recovery', timestamp: nowSeconds() - 60 }] },
      { factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }], aalError: true }
    )

    const result = await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })

    expect(result).toEqual(retry)
    expect(updateUser).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('sends a recovery session that still owes its code to /verify instead of changing it', async () => {
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockClear()
    const { updateUser } = await useRecoveryClient(
      { amr: [{ method: 'recovery', timestamp: nowSeconds() - 60 }] },
      { factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }], currentLevel: 'aal1' }
    )

    await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })

    expect(updateUser).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenNthCalledWith(1, '/verify')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('updates the password for a TOTP user once the recovery session has passed the code', async () => {
    const { updateUser } = await useRecoveryClient(
      {
        amr: [
          { method: 'totp', timestamp: nowSeconds() - 10 },
          { method: 'recovery', timestamp: nowSeconds() - 90 },
        ],
      },
      { factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }], currentLevel: 'aal2' }
    )

    await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })

    expect(updateUser).toHaveBeenCalledWith({ password: 'longenough1' })
  })

  it('updates the password for a verified, recent recovery sign-in and redirects home', async () => {
    const { redirect } = await import('next/navigation')
    const { updateUser } = await useRecoveryClient({
      amr: [{ method: 'recovery', timestamp: nowSeconds() - 60 }],
    })

    await updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })

    expect(updateUser).toHaveBeenCalledWith({ password: 'longenough1' })
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
  getClaims?: ReturnType<typeof vi.fn>
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
        // An ordinary sign-in unless a test says otherwise: no `recovery` entry.
        getClaims:
          options.getClaims ??
          vi.fn().mockResolvedValue({
            data: { claims: { sub: 'u1', amr: [{ method: 'password', timestamp: 0 }] } },
            error: null,
          }),
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

async function attemptMocks() {
  return await import('@/lib/auth/mfa-attempts')
}

async function resetAttemptMocks() {
  const { reserveAttempt, releaseAttempt, clearAttempts } = await attemptMocks()
  vi.mocked(reserveAttempt).mockReset().mockResolvedValue({ status: 'reserved', attempts: 1 })
  vi.mocked(releaseAttempt).mockReset().mockResolvedValue(undefined)
  vi.mocked(clearAttempts).mockReset().mockResolvedValue(undefined)
}

describe('logIn', () => {
  beforeEach(async () => {
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockClear()
    cookieStore.delete.mockClear()
    cookieStore.set.mockClear()
    cookieStore.get.mockReset()
    await resetAttemptMocks()
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

  it('does not refill the attempt budget on a fresh password sign-in', async () => {
    // The whole point of the server-side counter: an attacker holding the password could
    // previously clear their own failure count just by signing in again.
    const { clearAttempts, releaseAttempt } = await attemptMocks()
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1' })

    await logIn({ email: 'owner@example.com', password: 'password123' })

    expect(clearAttempts).not.toHaveBeenCalled()
    expect(releaseAttempt).not.toHaveBeenCalled()
    expect(cookieStore.set).not.toHaveBeenCalled()
    expect(cookieStore.delete).not.toHaveBeenCalled()
  })

  it('signs out and reports unavailability when the assurance level cannot be read', async () => {
    const { redirect } = await import('next/navigation')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { signOut } = await useAuthClient({
      factors: [totpFactor],
      aalError: true,
    })

    await logIn({ email: 'owner@example.com', password: 'password123' })

    expect(signOut).toHaveBeenCalled()
    expect(redirect).toHaveBeenNthCalledWith(1, '/login?error=mfa_unavailable')
    expect(redirect).toHaveBeenCalledTimes(1)
    consoleWarn.mockRestore()
  })

  it('sends an account with only an unsupported factor to /verify to explain, not round the loop', async () => {
    // Signing out with the generic notice put the user back on the password form, which signed
    // them straight back into the same dead end. /verify says why and who can fix it.
    const { redirect } = await import('next/navigation')
    const { signOut, getAuthenticatorAssuranceLevel } = await useAuthClient({
      factors: [{ id: 'f-phone', factor_type: 'phone', status: 'verified' }],
      currentLevel: 'aal1',
    })

    await logIn({ email: 'owner@example.com', password: 'password123' })

    expect(getAuthenticatorAssuranceLevel).toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenNthCalledWith(1, '/verify')
    expect(redirect).toHaveBeenCalledTimes(1)
  })
})

describe('endPendingSession scope', () => {
  beforeEach(async () => {
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockClear()
    await resetAttemptMocks()
  })

  it('signs out of this session only, never every device', async () => {
    // auth-js 2.112.2 defaults to `scope: 'global'`, which revokes every refresh token the user
    // holds. A bare signOut() here meant cancelling the challenge logged the user out of their
    // phone, and that anyone with only the password could revoke all of a victim's sessions by
    // deliberately failing five codes.
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { signOut } = await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1' })

    await cancelMfaChallenge()

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    consoleWarn.mockRestore()
  })
})

describe('verifyMfaChallenge', () => {
  beforeEach(async () => {
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockClear()
    cookieStore.delete.mockClear()
    cookieStore.set.mockClear()
    cookieStore.get.mockReset()
    await resetAttemptMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
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
    const { clearAttempts, reserveAttempt } = await attemptMocks()
    expect(reserveAttempt).toHaveBeenCalledWith('u1')
    expect(clearAttempts).toHaveBeenCalledWith('u1')
    expect(redirect).toHaveBeenNthCalledWith(1, '/')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('sends a session that began at a reset link on to /reset-password once the code passes', async () => {
    const { redirect } = await import('next/navigation')
    const now = Math.floor(Date.now() / 1000)
    const challenge = vi.fn().mockResolvedValue({ data: { id: 'challenge-9' }, error: null })
    const verify = vi
      .fn()
      .mockResolvedValue({ data: { access_token: 'aal2.access.token' }, error: null })
    // What GoTrue issues after verify() on a recovery session: the session's claim rows, most
    // recent first, so `recovery` is still there next to the new `totp`.
    const getClaims = vi.fn().mockResolvedValue({
      data: {
        claims: {
          sub: 'u1',
          amr: [
            { method: 'totp', timestamp: now },
            { method: 'recovery', timestamp: now - 120 },
          ],
        },
      },
      error: null,
    })
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1', challenge, verify, getClaims })

    await verifyMfaChallenge({ code: '123456' })

    expect(getClaims).toHaveBeenCalledWith('aal2.access.token')
    expect(redirect).toHaveBeenNthCalledWith(1, '/reset-password')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('takes the attempt from the budget before the code reaches Supabase', async () => {
    const { reserveAttempt } = await attemptMocks()
    const order: string[] = []
    vi.mocked(reserveAttempt).mockImplementation(async () => {
      order.push('reserve')
      return { status: 'reserved', attempts: 1 }
    })
    const challenge = vi.fn(async () => {
      order.push('challenge')
      return { data: { id: 'challenge-9' }, error: null }
    })
    const verify = vi.fn(async () => {
      order.push('verify')
      return { data: {}, error: null }
    })
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1', challenge, verify })

    await verifyMfaChallenge({ code: '123456' })

    expect(order).toEqual(['reserve', 'challenge', 'verify'])
  })

  it('rejects a wrong code, stays put, and keeps the reserved attempt as the failure', async () => {
    const { redirect } = await import('next/navigation')
    const { reserveAttempt, releaseAttempt } = await attemptMocks()
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
    // Keyed by the user id the server resolved, and never written to a cookie the client controls.
    expect(reserveAttempt).toHaveBeenCalledWith('u1')
    expect(releaseAttempt).not.toHaveBeenCalled()
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('refuses to challenge at all once the budget is spent, whatever the request carries', async () => {
    // The hole this replaces: the count lived in `fd_mfa_attempts`, so omitting the cookie made
    // `Number.parseInt` yield NaN and restarted the count at 1 on every request.
    const { redirect } = await import('next/navigation')
    const { reserveAttempt } = await attemptMocks()
    vi.mocked(reserveAttempt).mockResolvedValue({ status: 'exhausted' })
    const challenge = vi.fn()
    const verify = vi.fn()
    const { signOut } = await useAuthClient({
      factors: [totpFactor],
      currentLevel: 'aal1',
      challenge,
      verify,
    })

    await verifyMfaChallenge({ code: '000000' })

    expect(challenge).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(redirect).toHaveBeenNthCalledWith(1, '/login?error=mfa_attempts')
  })

  it('counts a non-fatal challenge failure too, so that call is not an unbounded loop', async () => {
    const { reserveAttempt, releaseAttempt } = await attemptMocks()
    const challenge = vi
      .fn()
      .mockResolvedValue({
        data: null,
        error: { code: 'something_new', status: 400, message: 'nope' },
      })
    const verify = vi.fn()
    await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1', challenge, verify })

    const result = await verifyMfaChallenge({ code: '123456' })

    expect(result).toEqual({ error: 'Could not verify that code. Please try again.' })
    expect(verify).not.toHaveBeenCalled()
    expect(reserveAttempt).toHaveBeenCalledWith('u1')
    expect(releaseAttempt).not.toHaveBeenCalled()
  })

  it.each(['challenge', 'verify'] as const)(
    'returns a message instead of rejecting when %s throws',
    async (which) => {
      // Supabase rethrows anything that is not an AuthError. An unhandled rejection here left the
      // form disabled with no message and no way forward but a reload.
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const challenge =
        which === 'challenge'
          ? vi.fn().mockRejectedValue(new TypeError('fetch failed'))
          : vi.fn().mockResolvedValue({ data: { id: 'challenge-9' }, error: null })
      const verify =
        which === 'verify'
          ? vi.fn().mockRejectedValue(new TypeError('fetch failed'))
          : vi.fn().mockResolvedValue({ data: {}, error: null })
      await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1', challenge, verify })

      const result = await verifyMfaChallenge({ code: '123456' })

      expect(result).toEqual({
        error: 'Could not reach two-factor sign-in. Please try again.',
      })
      // A thrown challenge() means verify() never ran, so the code was not evaluated and the slot
      // goes back. A thrown verify() may have been evaluated server-side, so it stays counted.
      const { releaseAttempt } = await attemptMocks()
      if (which === 'challenge') {
        expect(releaseAttempt).toHaveBeenCalledWith('u1')
      } else {
        expect(releaseAttempt).not.toHaveBeenCalled()
      }
      consoleError.mockRestore()
    }
  )

  it('fails closed when the attempt counter is unreachable, keeping the session for a retry', async () => {
    // The counter is the only per-account guessing bound, so an outage refuses the check rather
    // than skipping it. The pending session is kept: nothing to sign in again for.
    const { redirect } = await import('next/navigation')
    const { reserveAttempt } = await attemptMocks()
    vi.mocked(reserveAttempt).mockResolvedValue({ status: 'unavailable' })
    const challenge = vi.fn()
    const verify = vi.fn()
    const { signOut } = await useAuthClient({
      factors: [totpFactor],
      currentLevel: 'aal1',
      challenge,
      verify,
    })

    const result = await verifyMfaChallenge({ code: '123456' })

    expect(result).toEqual({
      error: 'Two-factor sign-in is temporarily unavailable. Please try again in a minute.',
    })
    expect(challenge).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('lets no more than the remaining budget reach mfa.verify() under concurrent requests', async () => {
    // Four attempts already used, one left. Five requests are held at a barrier inside getUser()
    // and released together. The budget fake is atomic the same way the Lua script is: the check
    // and the increment happen with nothing in between.
    const { reserveAttempt } = await attemptMocks()
    let used = 4
    vi.mocked(reserveAttempt).mockImplementation(async () => {
      if (used >= 5) return { status: 'exhausted' }
      used += 1
      return { status: 'reserved', attempts: used }
    })

    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const challenge = vi.fn(async () => ({ data: { id: 'challenge-9' }, error: null }))
    const verify = vi.fn(async () => ({
      data: null,
      error: { code: 'mfa_verification_failed', status: 400 },
    }))
    const { client } = mockAuthClient({ factors: [totpFactor], currentLevel: 'aal1', challenge, verify })
    const realGetUser = client.auth.getUser
    client.auth.getUser = vi.fn(async () => {
      await barrier
      return realGetUser()
    })
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(client as never)

    const requests = Array.from({ length: 5 }, (_, i) =>
      verifyMfaChallenge({ code: String(100000 + i) })
    )
    release()
    await Promise.all(requests)

    expect(client.auth.getUser).toHaveBeenCalledTimes(5)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(reserveAttempt).toHaveBeenCalledTimes(5)
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
    // The reservation goes back: Supabase refused to evaluate the code, so no guess was spent.
    const { releaseAttempt } = await attemptMocks()
    expect(releaseAttempt).toHaveBeenCalledWith('u1')
  })

  it('ends the pending session on the fifth counted failure', async () => {
    const { redirect } = await import('next/navigation')
    const { reserveAttempt, clearAttempts } = await attemptMocks()
    vi.mocked(reserveAttempt).mockResolvedValue({ status: 'reserved', attempts: 5 })
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

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    // The counter survives the teardown on purpose: its TTL is the lockout window, so clearing it
    // here would let the requester reset the budget by signing in again.
    expect(clearAttempts).not.toHaveBeenCalled()
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
    await resetAttemptMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('signs the pending session out locally and returns to login', async () => {
    const { redirect } = await import('next/navigation')
    const { signOut } = await useAuthClient({ factors: [totpFactor], currentLevel: 'aal1' })

    await cancelMfaChallenge()

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
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
