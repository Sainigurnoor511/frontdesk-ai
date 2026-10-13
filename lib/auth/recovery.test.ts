import { describe, it, expect, vi } from 'vitest'
import {
  checkRecoveryClaim,
  hasRecentRecoveryClaim,
  recentRecoverySubject,
  PASSWORD_RECOVERY_MAX_AGE_SECONDS,
  type ClaimsAwareClient,
} from './recovery'

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
const nowSeconds = NOW / 1000

function client(result: unknown): ClaimsAwareClient {
  return { auth: { getClaims: vi.fn().mockResolvedValue(result) } } as ClaimsAwareClient
}

function withAmr(amr: unknown, sub: unknown = 'u1'): ClaimsAwareClient {
  return client({ data: { claims: { amr, sub } }, error: null })
}

describe('hasRecentRecoveryClaim', () => {
  it('accepts a verified recovery sign-in inside the window', async () => {
    await expect(
      hasRecentRecoveryClaim(withAmr([{ method: 'recovery', timestamp: nowSeconds - 60 }]), {
        now: NOW,
      })
    ).resolves.toBe(true)
  })

  it('still accepts it after the TOTP step, which only adds a totp entry to the same session', async () => {
    // The shape GoTrue issues after `mfa.verify()` on a recovery session: `amr` is rebuilt from
    // every claim row of that session, most recent first.
    const amr = [
      { method: 'totp', timestamp: nowSeconds - 10 },
      { method: 'recovery', timestamp: nowSeconds - 120 },
    ]
    await expect(hasRecentRecoveryClaim(withAmr(amr), { now: NOW })).resolves.toBe(true)
  })

  it('rejects a recovery sign-in older than the window', async () => {
    const stale = nowSeconds - PASSWORD_RECOVERY_MAX_AGE_SECONDS - 1
    await expect(
      hasRecentRecoveryClaim(withAmr([{ method: 'recovery', timestamp: stale }]), { now: NOW })
    ).resolves.toBe(false)
  })

  it('rejects a timestamp far in the future', async () => {
    await expect(
      hasRecentRecoveryClaim(withAmr([{ method: 'recovery', timestamp: nowSeconds + 3600 }]), {
        now: NOW,
      })
    ).resolves.toBe(false)
  })

  it('rejects ordinary sign-ins, aal1 or aal2', async () => {
    for (const amr of [
      [{ method: 'password', timestamp: nowSeconds }],
      [
        { method: 'totp', timestamp: nowSeconds },
        { method: 'oauth', timestamp: nowSeconds },
      ],
      [{ method: 'magiclink', timestamp: nowSeconds }],
    ]) {
      await expect(hasRecentRecoveryClaim(withAmr(amr), { now: NOW })).resolves.toBe(false)
    }
  })

  it('rejects timestamp-less string entries, which cannot prove recency', async () => {
    await expect(hasRecentRecoveryClaim(withAmr(['recovery']), { now: NOW })).resolves.toBe(false)
  })

  it('rejects a missing or malformed amr claim', async () => {
    for (const amr of [undefined, null, 'recovery', { method: 'recovery' }]) {
      await expect(hasRecentRecoveryClaim(withAmr(amr), { now: NOW })).resolves.toBe(false)
    }
  })

  it('rejects a token that does not verify', async () => {
    const result = { data: null, error: { name: 'AuthInvalidJwtError', message: 'Invalid JWT signature' } }
    await expect(hasRecentRecoveryClaim(client(result), { now: NOW })).resolves.toBe(false)
  })

  it('never rejects, even when getClaims throws', async () => {
    const throwing = { auth: { getClaims: vi.fn().mockRejectedValue(new Error('boom')) } }
    await expect(
      hasRecentRecoveryClaim(throwing as unknown as ClaimsAwareClient, { now: NOW })
    ).resolves.toBe(false)
  })

  it('verifies the session token itself unless handed a freshly issued one', async () => {
    const supabase = withAmr([{ method: 'recovery', timestamp: nowSeconds }])
    await hasRecentRecoveryClaim(supabase, { now: NOW })
    expect(supabase.auth.getClaims).toHaveBeenCalledWith(undefined)

    await hasRecentRecoveryClaim(supabase, { now: NOW, jwt: 'issued.access.token' })
    expect(supabase.auth.getClaims).toHaveBeenLastCalledWith('issued.access.token')
  })
})

describe('checkRecoveryClaim', () => {
  it('is valid, with the verified subject, for a recent recovery sign-in', async () => {
    await expect(
      checkRecoveryClaim(withAmr([{ method: 'recovery', timestamp: nowSeconds }], 'u-7'), {
        now: NOW,
      })
    ).resolves.toEqual({ status: 'valid', userId: 'u-7' })
  })

  it('is absent for a stale or missing claim, a bad signature, or no session', async () => {
    const stale = nowSeconds - PASSWORD_RECOVERY_MAX_AGE_SECONDS - 1
    for (const supabase of [
      withAmr([{ method: 'recovery', timestamp: stale }]),
      withAmr([{ method: 'password', timestamp: nowSeconds }]),
      client({ data: null, error: { name: 'AuthInvalidJwtError', message: 'Invalid JWT signature' } }),
      client({ data: null, error: { name: 'AuthApiError', status: 403, message: 'bad_jwt' } }),
      client({ data: null, error: null }),
    ]) {
      await expect(checkRecoveryClaim(supabase, { now: NOW })).resolves.toEqual({ status: 'absent' })
    }
  })

  it('is unverifiable, not absent, when the auth server cannot be asked', async () => {
    // These used to collapse into "this reset link has expired", so a user holding a good link
    // was told to throw it away during a network blip.
    const throwing = {
      auth: { getClaims: vi.fn().mockRejectedValue(new TypeError('fetch failed')) },
    } as unknown as ClaimsAwareClient
    for (const supabase of [
      throwing,
      client({ data: null, error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } }),
      client({ data: null, error: { name: 'AuthApiError', status: 503, message: 'unavailable' } }),
      client({ data: null, error: { name: 'AuthApiError', status: 429, message: 'rate limited' } }),
    ]) {
      await expect(checkRecoveryClaim(supabase, { now: NOW })).resolves.toEqual({
        status: 'unverifiable',
      })
    }
  })

  it('keeps both non-valid results fail-closed in hasRecentRecoveryClaim', async () => {
    const unreachable = client({
      data: null,
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' },
    })
    await expect(hasRecentRecoveryClaim(unreachable, { now: NOW })).resolves.toBe(false)
    await expect(recentRecoverySubject(unreachable, { now: NOW })).resolves.toBeNull()
  })
})

describe('recentRecoverySubject', () => {
  it("returns the verified token's user id when the recovery claim passes", async () => {
    await expect(
      recentRecoverySubject(withAmr([{ method: 'recovery', timestamp: nowSeconds }], 'u-42'), {
        now: NOW,
      })
    ).resolves.toBe('u-42')
  })

  it('returns null without a recovery claim, or without a subject', async () => {
    await expect(
      recentRecoverySubject(withAmr([{ method: 'password', timestamp: nowSeconds }]), { now: NOW })
    ).resolves.toBeNull()
    await expect(
      recentRecoverySubject(withAmr([{ method: 'recovery', timestamp: nowSeconds }], ''), {
        now: NOW,
      })
    ).resolves.toBeNull()
  })
})

// Cases `main` added when it ported the signed recovery claim (a7e7a22), kept on merge. They
// drive `checkRecoveryClaim` directly, where the suites above go through its wrappers.
describe('checkRecoveryClaim (cases from main)', () => {
  const absent = { status: 'absent' }

  it('is valid, with the verified subject, for a recovery sign-in inside the window', async () => {
    await expect(
      checkRecoveryClaim(withAmr([{ method: 'recovery', timestamp: nowSeconds - 60 }], 'u-7'), {
        now: NOW,
      })
    ).resolves.toEqual({ status: 'valid', userId: 'u-7' })
  })

  it('finds the recovery entry among other methods of the same session', async () => {
    const amr = [
      { method: 'totp', timestamp: nowSeconds - 10 },
      { method: 'recovery', timestamp: nowSeconds - 120 },
    ]
    await expect(checkRecoveryClaim(withAmr(amr), { now: NOW })).resolves.toMatchObject({
      status: 'valid',
    })
  })

  it('is absent for a recovery sign-in older than the 15-minute window', async () => {
    const stale = nowSeconds - PASSWORD_RECOVERY_MAX_AGE_SECONDS - 1
    await expect(
      checkRecoveryClaim(withAmr([{ method: 'recovery', timestamp: stale }]), { now: NOW })
    ).resolves.toEqual(absent)
  })

  it('is absent for a timestamp far in the future', async () => {
    await expect(
      checkRecoveryClaim(withAmr([{ method: 'recovery', timestamp: nowSeconds + 3600 }]), {
        now: NOW,
      })
    ).resolves.toEqual(absent)
  })

  it('is absent for ordinary sign-ins', async () => {
    for (const amr of [
      [{ method: 'password', timestamp: nowSeconds }],
      [
        { method: 'totp', timestamp: nowSeconds },
        { method: 'oauth', timestamp: nowSeconds },
      ],
      [{ method: 'magiclink', timestamp: nowSeconds }],
    ]) {
      await expect(checkRecoveryClaim(withAmr(amr), { now: NOW })).resolves.toEqual(absent)
    }
  })

  it('is absent for timestamp-less string entries, which cannot prove recency', async () => {
    await expect(checkRecoveryClaim(withAmr(['recovery']), { now: NOW })).resolves.toEqual(absent)
  })

  it('is absent for a missing or malformed amr claim, or a missing subject', async () => {
    for (const amr of [undefined, null, 'recovery', { method: 'recovery' }]) {
      await expect(checkRecoveryClaim(withAmr(amr), { now: NOW })).resolves.toEqual(absent)
    }
    await expect(
      checkRecoveryClaim(withAmr([{ method: 'recovery', timestamp: nowSeconds }], ''), { now: NOW })
    ).resolves.toEqual(absent)
  })

  it('is absent for a token that does not verify, or no session', async () => {
    for (const supabase of [
      client({ data: null, error: { name: 'AuthInvalidJwtError', message: 'Invalid JWT signature' } }),
      client({ data: null, error: { name: 'AuthApiError', status: 403, message: 'bad_jwt' } }),
      client({ data: null, error: null }),
    ]) {
      await expect(checkRecoveryClaim(supabase, { now: NOW })).resolves.toEqual(absent)
    }
  })
})
