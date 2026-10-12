import { describe, it, expect, vi } from 'vitest'
import { hasRecentRecoveryClaim, PASSWORD_RECOVERY_MAX_AGE_SECONDS, type ClaimsAwareClient } from './recovery'

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
const nowSeconds = NOW / 1000

function client(result: unknown): ClaimsAwareClient {
  return { auth: { getClaims: vi.fn().mockResolvedValue(result) } } as ClaimsAwareClient
}

function withAmr(amr: unknown): ClaimsAwareClient {
  return client({ data: { claims: { amr } }, error: null })
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

  it('verifies the session token itself rather than one the caller supplies', async () => {
    const supabase = withAmr([{ method: 'recovery', timestamp: nowSeconds }])
    await hasRecentRecoveryClaim(supabase, { now: NOW })
    expect(supabase.auth.getClaims).toHaveBeenCalledWith(undefined)
  })
})
