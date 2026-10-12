import { describe, it, expect, vi } from 'vitest'
import type { AuthError, User } from '@supabase/supabase-js'
import {
  resolveMfaGate,
  resolveMfaGateForUser,
  isMfaSatisfiedForUser,
  isMfaExemptPath,
  mfaErrorMessage,
  type MfaAwareClient,
} from './mfa'

type FakeFactor = { id: string; factor_type: string; status: string }

function fakeUser(factors?: unknown): User {
  return { id: 'u1', email: 'owner@example.com', factors } as unknown as User
}

function fakeClient(options: {
  getUser?: ReturnType<typeof vi.fn>
  aal?: ReturnType<typeof vi.fn>
}): MfaAwareClient {
  return {
    auth: {
      getUser: options.getUser ?? vi.fn(),
      mfa: { getAuthenticatorAssuranceLevel: options.aal ?? vi.fn() },
    },
  } as unknown as MfaAwareClient
}

function aalOk(currentLevel: string | null, nextLevel: string | null = null) {
  return vi.fn().mockResolvedValue({ data: { currentLevel, nextLevel }, error: null })
}

const totpFactor: FakeFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }

describe('resolveMfaGateForUser', () => {
  it('is unauthenticated with no user', async () => {
    const aal = aalOk('aal1')
    await expect(resolveMfaGateForUser(fakeClient({ aal }), null)).resolves.toEqual({
      state: 'unauthenticated',
    })
    expect(aal).not.toHaveBeenCalled()
  })

  it('is satisfied with no factors, without touching the assurance-level API', async () => {
    const aal = aalOk('aal1')

    await expect(resolveMfaGateForUser(fakeClient({ aal }), fakeUser(undefined))).resolves.toEqual({
      state: 'satisfied',
    })
    await expect(resolveMfaGateForUser(fakeClient({ aal }), fakeUser([]))).resolves.toEqual({
      state: 'satisfied',
    })
    expect(aal).not.toHaveBeenCalled()
  })

  it('is satisfied when only unverified factors exist', async () => {
    const aal = aalOk('aal1')
    const user = fakeUser([{ id: 'f1', factor_type: 'totp', status: 'unverified' }])

    await expect(resolveMfaGateForUser(fakeClient({ aal }), user)).resolves.toEqual({
      state: 'satisfied',
    })
    expect(aal).not.toHaveBeenCalled()
  })

  it('is pending for a verified TOTP factor on an aal1 session', async () => {
    const gate = await resolveMfaGateForUser(
      fakeClient({ aal: aalOk('aal1') }),
      fakeUser([totpFactor])
    )

    expect(gate).toEqual({ state: 'pending', factorId: 'factor-1', email: 'owner@example.com' })
  })

  it('is satisfied once the token says aal2', async () => {
    await expect(
      resolveMfaGateForUser(fakeClient({ aal: aalOk('aal2') }), fakeUser([totpFactor]))
    ).resolves.toEqual({ state: 'satisfied' })
  })

  it('is pending when the token carries no aal claim at all', async () => {
    await expect(
      resolveMfaGateForUser(fakeClient({ aal: aalOk(null) }), fakeUser([totpFactor]))
    ).resolves.toEqual({ state: 'pending', factorId: 'factor-1', email: 'owner@example.com' })
  })

  it('ignores a forged nextLevel: the cookie claiming aal1/aal1 is still pending', async () => {
    // The tamper case. `getAuthenticatorAssuranceLevel` derives nextLevel from the unsigned
    // session cookie, so an attacker who deletes `user.factors` there gets nextLevel: 'aal1'.
    // The factor list comes from getUser() instead, so the gate still denies.
    const gate = await resolveMfaGateForUser(
      fakeClient({ aal: aalOk('aal1', 'aal1') }),
      fakeUser([totpFactor])
    )

    expect(gate).toEqual({ state: 'pending', factorId: 'factor-1', email: 'owner@example.com' })
  })

  it('is indeterminate when the factor list is not an array', async () => {
    await expect(
      resolveMfaGateForUser(fakeClient({ aal: aalOk('aal1') }), fakeUser({ totp: 'yes' }))
    ).resolves.toEqual({ state: 'indeterminate' })
  })

  it('is indeterminate when the assurance-level read errors', async () => {
    const aal = vi.fn().mockResolvedValue({ data: null, error: { code: 'boom' } as AuthError })

    await expect(
      resolveMfaGateForUser(fakeClient({ aal }), fakeUser([totpFactor]))
    ).resolves.toEqual({ state: 'indeterminate' })
  })

  it('is indeterminate when the assurance-level read returns null data', async () => {
    const aal = vi.fn().mockResolvedValue({ data: null, error: null })

    await expect(
      resolveMfaGateForUser(fakeClient({ aal }), fakeUser([totpFactor]))
    ).resolves.toEqual({ state: 'indeterminate' })
  })

  it('never rejects: a thrown assurance-level read becomes indeterminate', async () => {
    const aal = vi.fn().mockRejectedValue(new Error('malformed jwt'))

    await expect(
      resolveMfaGateForUser(fakeClient({ aal }), fakeUser([totpFactor]))
    ).resolves.toEqual({ state: 'indeterminate' })
  })

  it('is indeterminate when the only verified factor is not TOTP, and challenges nothing', async () => {
    const user = fakeUser([{ id: 'f-phone', factor_type: 'phone', status: 'verified' }])

    await expect(resolveMfaGateForUser(fakeClient({ aal: aalOk('aal1') }), user)).resolves.toEqual({
      state: 'indeterminate',
    })
  })

  it('is satisfied for an aal2 session whose only verified factor is not TOTP', async () => {
    const user = fakeUser([{ id: 'f-phone', factor_type: 'phone', status: 'verified' }])

    await expect(resolveMfaGateForUser(fakeClient({ aal: aalOk('aal2') }), user)).resolves.toEqual({
      state: 'satisfied',
    })
  })
})

describe('resolveMfaGate', () => {
  it('is unauthenticated when getUser returns an error', async () => {
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { code: 'bad_jwt' } as AuthError })
    const aal = aalOk('aal2')

    await expect(resolveMfaGate(fakeClient({ getUser, aal }))).resolves.toEqual({
      state: 'unauthenticated',
    })
    expect(aal).not.toHaveBeenCalled()
  })

  it('never rejects: a thrown getUser becomes unauthenticated', async () => {
    const getUser = vi.fn().mockRejectedValue(new Error('fetch failed'))

    await expect(resolveMfaGate(fakeClient({ getUser }))).resolves.toEqual({
      state: 'unauthenticated',
    })
  })

  it('resolves the gate from the server-fetched user', async () => {
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: fakeUser([totpFactor]) }, error: null })

    await expect(resolveMfaGate(fakeClient({ getUser, aal: aalOk('aal1') }))).resolves.toEqual({
      state: 'pending',
      factorId: 'factor-1',
      email: 'owner@example.com',
    })
  })
})

describe('isMfaSatisfiedForUser', () => {
  it('is false for pending and for indeterminate, true for satisfied', async () => {
    await expect(
      isMfaSatisfiedForUser(fakeClient({ aal: aalOk('aal1') }), fakeUser([totpFactor]))
    ).resolves.toBe(false)
    await expect(
      isMfaSatisfiedForUser(
        fakeClient({ aal: vi.fn().mockRejectedValue(new Error('x')) }),
        fakeUser([totpFactor])
      )
    ).resolves.toBe(false)
    await expect(
      isMfaSatisfiedForUser(fakeClient({ aal: aalOk('aal2') }), fakeUser([totpFactor]))
    ).resolves.toBe(true)
  })
})

describe('isMfaExemptPath', () => {
  it('exempts the challenge screen and the other auth routes', () => {
    for (const path of [
      '/verify',
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/callback',
      '/smb/acme',
      '/api/webhooks/livekit',
      '/api/livekit/endpoint',
      '/_next/static/chunk.js',
      '/favicon.ico',
      '/robots.txt',
      '/sitemap.xml',
      '/manifest.webmanifest',
      '/llms.txt',
      '/brand/logo.svg',
    ]) {
      expect(isMfaExemptPath(path)).toBe(true)
    }
  })

  it('gates everything else, including app and API routes', () => {
    for (const path of [
      '/',
      '/settings',
      '/onboarding',
      '/analytics',
      '/agents/abc',
      '/conversations',
      '/api/assistant',
      '/api/conversations/abc/recording',
      '/api/integrations/google-calendar/callback',
    ]) {
      expect(isMfaExemptPath(path)).toBe(false)
    }
  })

  it('matches on segment boundaries, so /verify-email is not exempt', () => {
    expect(isMfaExemptPath('/verify-email')).toBe(false)
    expect(isMfaExemptPath('/logins')).toBe(false)
    expect(isMfaExemptPath('/verify/help')).toBe(true)
  })
})

describe('mfaErrorMessage', () => {
  function authError(code: string, status = 400, message = 'nope'): AuthError {
    return { code, status, message, name: 'AuthApiError' } as unknown as AuthError
  }

  it('is retryable for a wrong code', () => {
    expect(mfaErrorMessage(authError('mfa_verification_failed'))).toEqual({
      message: 'That code is not right. Check your authenticator app and try again.',
      fatal: false,
      throttled: false,
    })
  })

  it('distinguishes an expired challenge from a wrong code', () => {
    const expired = mfaErrorMessage(authError('mfa_challenge_expired'))
    const wrong = mfaErrorMessage(authError('mfa_verification_failed'))

    expect(expired.message).toBe('That code expired. Enter the current code from your app.')
    expect(expired.message).not.toBe(wrong.message)
    expect(mfaErrorMessage(authError('otp_expired')).message).toBe(expired.message)
  })

  it('flags Supabase throttling without making it fatal', () => {
    expect(mfaErrorMessage(authError('over_request_rate_limit'))).toEqual({
      message: 'Too many attempts. Please wait a few minutes and try again.',
      fatal: false,
      throttled: true,
    })
  })

  it('is fatal when the factor or the feature is gone', () => {
    expect(mfaErrorMessage(authError('mfa_factor_not_found')).fatal).toBe(true)
    expect(mfaErrorMessage(authError('mfa_ip_address_mismatch')).fatal).toBe(true)
    expect(mfaErrorMessage(authError('mfa_totp_verify_not_enabled')).fatal).toBe(true)
    expect(mfaErrorMessage(authError('insufficient_aal')).fatal).toBe(true)
  })

  it('falls back to the rate-limit mapping for a code-less 429', () => {
    expect(mfaErrorMessage(authError('', 429))).toEqual({
      message: 'Too many attempts. Please wait a few minutes and try again.',
      fatal: false,
      throttled: true,
    })
    expect(mfaErrorMessage(authError('', 400, 'request rate limit reached')).throttled).toBe(true)
  })

  it('falls back to generic retryable copy for an unknown code', () => {
    expect(mfaErrorMessage(authError('something_new'))).toEqual({
      message: 'Could not verify that code. Please try again.',
      fatal: false,
      throttled: false,
    })
  })
})
