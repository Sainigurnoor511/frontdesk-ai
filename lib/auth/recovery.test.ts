import { describe, it, expect, vi } from 'vitest'
import {
  checkRecoveryClaim,
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

const absent = { status: 'absent' }

describe('checkRecoveryClaim', () => {
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

  it('is unverifiable, not absent, when the auth server cannot be asked', async () => {
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

  it('verifies the session token itself unless handed a freshly issued one', async () => {
    const supabase = withAmr([{ method: 'recovery', timestamp: nowSeconds }])
    await checkRecoveryClaim(supabase, { now: NOW })
    expect(supabase.auth.getClaims).toHaveBeenCalledWith(undefined)
    await checkRecoveryClaim(supabase, { now: NOW, jwt: 'issued.access.token' })
    expect(supabase.auth.getClaims).toHaveBeenLastCalledWith('issued.access.token')
  })
})
