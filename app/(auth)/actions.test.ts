import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signUp, signOutAllDevices, requestPasswordReset, updatePassword } from './actions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Lets a test send the old `fd_password_recovery` cookie, to prove it no longer counts as proof.
const cookieStore = { has: vi.fn(), get: vi.fn(), delete: vi.fn() }
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

  const nowSeconds = () => Math.floor(Date.now() / 1000)

  /**
   * A signed-in client whose verified token carries `amr`. `getUser` succeeds for every case, so
   * the only thing separating a refusal from a password change is the recovery proof.
   */
  async function useRecoveryClient(
    claims:
      | { amr?: unknown }
      | { error: string; name?: string; status?: number }
      | { throws: Error }
  ) {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const updateUser = vi.fn().mockResolvedValue({ error: null })
    const getClaims =
      'throws' in claims
        ? vi.fn().mockRejectedValue(claims.throws)
        : vi.fn().mockResolvedValue(
            'error' in claims
              ? {
                  data: null,
                  error: {
                    name: claims.name ?? 'AuthInvalidJwtError',
                    status: claims.status,
                    message: claims.error,
                  },
                }
              : {
                  data: { claims: { sub: 'u1', ...claims }, header: {}, signature: new Uint8Array() },
                  error: null,
                }
          )
    vi.mocked(createSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
        getClaims,
        updateUser,
      },
    } as never)
    return { updateUser, getClaims }
  }

  const expired = { error: 'This reset link has expired. Request a new one.' }
  const retry = {
    error:
      'We could not confirm your reset link just now. Your password was not changed. Please try again in a moment.',
  }
  const submit = () => updatePassword({ password: 'longenough1', confirmPassword: 'longenough1' })

  /** The old proof of a reset link, which any client can send. */
  function sendForgedRecoveryCookie() {
    cookieStore.has.mockImplementation((name: string) => name === 'fd_password_recovery')
    cookieStore.get.mockImplementation((name: string) =>
      name === 'fd_password_recovery' ? { name, value: '1' } : undefined
    )
  }

  beforeEach(() => {
    // Every refusal below is made with the old cookie present, so it is the signed claim, not the
    // cookie's absence, that refuses.
    sendForgedRecoveryCookie()
  })

  it('refuses a forged recovery cookie on a session with no verified recovery claim', async () => {
    // The pre-fix exploit: `fd_password_recovery=1` was unsigned and bound to nothing, so any
    // signed-in session could send it and change the password without ever opening a reset link.
    const { updateUser } = await useRecoveryClient({ amr: [] })

    expect(await submit()).toEqual(expired)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it.each([
    ['password', [{ method: 'password', timestamp: nowSeconds() }]],
    ['OAuth', [{ method: 'oauth', timestamp: nowSeconds() }]],
    [
      'password + TOTP',
      [
        { method: 'totp', timestamp: nowSeconds() },
        { method: 'password', timestamp: nowSeconds() - 30 },
      ],
    ],
  ])('refuses an ordinary %s session with no recovery marker', async (_label, amr) => {
    const { updateUser } = await useRecoveryClient({ amr })

    expect(await submit()).toEqual(expired)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses a recovery sign-in older than the 15-minute window', async () => {
    const { updateUser } = await useRecoveryClient({
      amr: [{ method: 'recovery', timestamp: nowSeconds() - 16 * 60 }],
    })

    expect(await submit()).toEqual(expired)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses when the token does not verify', async () => {
    const { updateUser } = await useRecoveryClient({ error: 'Invalid JWT signature' })

    expect(await submit()).toEqual(expired)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it.each([
    ['getClaims() throws', { throws: new TypeError('fetch failed') }],
    ['getClaims() returns a retryable error', { error: 'fetch failed', name: 'AuthRetryableFetchError', status: 0 }],
  ])('refuses with a retry message, not "expired", when %s', async (_label, claims) => {
    const { updateUser } = await useRecoveryClient(claims)

    expect(await submit()).toEqual(retry)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('updates the password for a verified, recent recovery sign-in and redirects home', async () => {
    const { redirect } = await import('next/navigation')
    // No cookie at all: the signed claim is the whole proof.
    cookieStore.has.mockReturnValue(false)
    cookieStore.get.mockReturnValue(undefined)
    const { updateUser } = await useRecoveryClient({
      amr: [{ method: 'recovery', timestamp: nowSeconds() - 60 }],
    })

    await submit()

    expect(updateUser).toHaveBeenCalledWith({ password: 'longenough1' })
    expect(redirect).toHaveBeenCalledWith('/')
  })
})
