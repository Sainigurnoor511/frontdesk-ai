import { describe, it, expect, vi } from 'vitest'
import { signUp, signOutAllDevices, requestPasswordReset, updatePassword } from './actions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

const cookieStore = { has: vi.fn(), delete: vi.fn() }
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
