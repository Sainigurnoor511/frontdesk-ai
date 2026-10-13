import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { redeemRecoveryCode, verifyMfaChallenge } from './actions'
import { issueRecoveryCodes } from '@/lib/auth/recovery-codes'
import { createRecoveryStore } from '@/lib/auth/recovery-codes-test-store'
import { MFA_MAX_ATTEMPTS, resolveMfaGate } from '@/lib/auth/mfa'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ has: vi.fn(), delete: vi.fn(), get: vi.fn(), set: vi.fn() })),
}))
vi.mock('@/lib/email/send-mfa-recovery-notice', () => ({
  sendMfaRecoveryNotice: vi.fn(async () => {}),
}))

// The attempt budget with the semantics `lib/auth/mfa-attempts.ts` gives it (an atomic reserve
// that refuses at MFA_MAX_ATTEMPTS, a release, a clear), kept in memory and keyed by user id like
// the Redis counter. The Lua scripts themselves are covered against a real Redis in
// lib/auth/mfa-attempts.test.ts; what matters here is that both code paths draw from ONE budget.
const budget = vi.hoisted(() => new Map<string, number>())
vi.mock('@/lib/auth/mfa-attempts', () => ({
  reserveAttempt: vi.fn(async (userId: string) => {
    const used = budget.get(userId) ?? 0
    if (used >= 5) return { status: 'exhausted' }
    budget.set(userId, used + 1)
    return { status: 'reserved', attempts: used + 1 }
  }),
  releaseAttempt: vi.fn(async (userId: string) => {
    budget.set(userId, Math.max(0, (budget.get(userId) ?? 0) - 1))
  }),
  clearAttempts: vi.fn(async (userId: string) => {
    budget.delete(userId)
  }),
}))

const USER = 'user-1'
const OTHER_USER = 'user-2'
const SETTINGS = '/settings?tab=account&mfa=recovered'
const WRONG = 'ZZZZZ-ZZZZZ'

let store: ReturnType<typeof createRecoveryStore>
let session: ReturnType<ReturnType<typeof createRecoveryStore>['session']>
let codes: string[]

async function setUp(options: { currentLevel?: 'aal1' | 'aal2' } = {}) {
  const { createClient, createServiceRoleClient } = await import('@/lib/supabase/server')
  store = createRecoveryStore()
  store.factors.set(USER, [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }])
  store.factors.set(OTHER_USER, [{ id: 'factor-2', factor_type: 'totp', status: 'verified' }])
  const issued = await issueRecoveryCodes(store.service as never, USER)
  if (!('codes' in issued)) throw new Error('setup: codes not issued')
  codes = issued.codes
  await issueRecoveryCodes(store.service as never, OTHER_USER)
  session = store.session(USER, options)
  vi.mocked(createClient).mockResolvedValue(session as never)
  vi.mocked(createServiceRoleClient).mockReturnValue(store.service as never)
}

const userRows = (userId: string) => store.rows.filter((row) => row.user_id === userId)

beforeEach(async () => {
  vi.clearAllMocks()
  budget.clear()
  vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-for-recovery-codes')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  await setUp()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('redeemRecoveryCode — a valid code from a pending session', () => {
  it('removes the factor, deletes the remaining codes, revokes other sessions and clears the budget', async () => {
    const { redirect } = await import('next/navigation')
    const { clearAttempts } = await import('@/lib/auth/mfa-attempts')
    const { sendMfaRecoveryNotice } = await import('@/lib/email/send-mfa-recovery-notice')
    budget.set(USER, 2) // two earlier misses, so the clear is observable

    expect(await resolveMfaGate(session as never)).toMatchObject({ state: 'pending' })
    // Typed as a person might: lower case, no dash.
    await redeemRecoveryCode({ code: codes[3].replace('-', '').toLowerCase() })

    expect(store.deleteFactor).toHaveBeenCalledWith({ userId: USER, id: 'factor-1' })
    expect(store.factors.get(USER)).toEqual([])
    expect(userRows(USER)).toEqual([])
    expect(session.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(session.auth.signOut).not.toHaveBeenCalledWith({ scope: 'global' })
    expect(clearAttempts).toHaveBeenCalledWith(USER)
    expect(budget.has(USER)).toBe(false)
    expect(redirect).toHaveBeenCalledWith(SETTINGS)
    expect(sendMfaRecoveryNotice).toHaveBeenCalledWith({
      to: 'owner@example.com',
      usedAt: expect.any(Date),
    })

    // The session that redeemed the code is now past the gate: no verified factor is left.
    expect(await resolveMfaGate(session as never)).toEqual({ state: 'satisfied' })

    // Nobody else's factor or codes were touched.
    expect(store.factors.get(OTHER_USER)).toHaveLength(1)
    expect(userRows(OTHER_USER)).toHaveLength(10)
  })

  it('cannot redeem another user’s code', async () => {
    const { redirect } = await import('next/navigation')
    const other = await issueRecoveryCodes(store.service as never, OTHER_USER)
    if (!('codes' in other)) throw new Error('setup')

    expect(await redeemRecoveryCode({ code: other.codes[0] })).toEqual({
      error: 'That recovery code is not valid or has already been used.',
    })
    expect(store.deleteFactor).not.toHaveBeenCalled()
    expect(userRows(OTHER_USER).every((row) => row.used_at === null)).toBe(true)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('puts the code back and the slot back when the factor cannot be removed', async () => {
    const { redirect } = await import('next/navigation')
    store.failures.deleteFactor = true

    expect(await redeemRecoveryCode({ code: codes[0] })).toEqual({
      error: 'Could not remove two-factor authentication. Your recovery code still works. Please try again.',
    })
    expect(userRows(USER)).toHaveLength(10)
    expect(userRows(USER).every((row) => row.used_at === null)).toBe(true)
    expect(budget.get(USER)).toBe(0)
    expect(session.auth.signOut).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('redeemRecoveryCode — single use', () => {
  it('accepts exactly one of two concurrent submissions of the same code', async () => {
    const { redirect } = await import('next/navigation')
    const { reserveAttempt } = await import('@/lib/auth/mfa-attempts')
    const { sendMfaRecoveryNotice } = await import('@/lib/email/send-mfa-recovery-notice')

    const results = await Promise.all([
      redeemRecoveryCode({ code: codes[0] }),
      redeemRecoveryCode({ code: codes[0] }),
    ])

    // Both reached the code check, so the race was real.
    expect(reserveAttempt).toHaveBeenCalledTimes(2)
    expect(vi.mocked(redirect).mock.calls.filter(([to]) => to === SETTINGS)).toHaveLength(1)
    expect(results.filter((result) => result?.error)).toEqual([
      { error: 'That recovery code is not valid or has already been used.' },
    ])
    expect(sendMfaRecoveryNotice).toHaveBeenCalledTimes(1)
  })

  it('refuses a code that was already used', async () => {
    const { redirect } = await import('next/navigation')
    await redeemRecoveryCode({ code: codes[0] })
    vi.mocked(redirect).mockClear()
    // Re-enrol, so the session is pending again, and try the same code.
    store.factors.set(USER, [{ id: 'factor-3', factor_type: 'totp', status: 'verified' }])
    await issueRecoveryCodes(store.service as never, USER)

    expect(await redeemRecoveryCode({ code: codes[0] })).toEqual({
      error: 'That recovery code is not valid or has already been used.',
    })
    expect(store.factors.get(USER)).toHaveLength(1)
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('redeemRecoveryCode — shared attempt budget', () => {
  it('spends an attempt on a wrong code, before anything else is checked', async () => {
    const { reserveAttempt } = await import('@/lib/auth/mfa-attempts')

    expect(await redeemRecoveryCode({ code: WRONG })).toEqual({
      error: 'That recovery code is not valid or has already been used.',
    })
    expect(reserveAttempt).toHaveBeenCalledWith(USER)
    expect(budget.get(USER)).toBe(1)
    expect(store.factors.get(USER)).toHaveLength(1)
  })

  it('refuses even a correct code once wrong codes have spent the budget', async () => {
    const { redirect } = await import('next/navigation')
    for (let attempt = 1; attempt < MFA_MAX_ATTEMPTS; attempt++) {
      await redeemRecoveryCode({ code: WRONG })
    }
    // The fifth wrong code is the last attempt: the pending session ends.
    await redeemRecoveryCode({ code: WRONG })
    expect(redirect).toHaveBeenLastCalledWith('/login?error=mfa_attempts')
    expect(session.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' })
    vi.mocked(redirect).mockClear()

    await redeemRecoveryCode({ code: codes[0] })

    expect(redirect).toHaveBeenCalledWith('/login?error=mfa_attempts')
    expect(redirect).not.toHaveBeenCalledWith(SETTINGS)
    expect(store.factors.get(USER)).toHaveLength(1)
    expect(userRows(USER).every((row) => row.used_at === null)).toBe(true)
  })

  it('shares one budget with the TOTP path, so alternating buys no extra guesses', async () => {
    const { redirect } = await import('next/navigation')
    Object.assign(session.auth.mfa, {
      challenge: vi.fn(async () => ({ data: { id: 'challenge-1' }, error: null })),
      verify: vi.fn(async () => ({
        data: null,
        error: { name: 'AuthApiError', code: 'mfa_verification_failed', message: 'Invalid TOTP code', status: 422 },
      })),
    })
    for (let attempt = 1; attempt < MFA_MAX_ATTEMPTS; attempt++) {
      await verifyMfaChallenge({ code: '000000' })
    }
    expect(budget.get(USER)).toBe(MFA_MAX_ATTEMPTS - 1)

    // The fifth guess of the window, on the other path, is the last one.
    await redeemRecoveryCode({ code: WRONG })
    expect(redirect).toHaveBeenLastCalledWith('/login?error=mfa_attempts')
    vi.mocked(redirect).mockClear()

    await redeemRecoveryCode({ code: codes[0] })
    expect(redirect).toHaveBeenCalledWith('/login?error=mfa_attempts')
    expect(store.factors.get(USER)).toHaveLength(1)
  })

  it('gives the slot back when the code could not be looked up', async () => {
    store.failures.update = true
    expect(await redeemRecoveryCode({ code: codes[0] })).toEqual({
      error: 'Could not check that recovery code. Please try again.',
    })
    expect(budget.get(USER)).toBe(0)
  })
})

describe('redeemRecoveryCode — callers that are not pending', () => {
  async function expectNothingChecked() {
    const { reserveAttempt } = await import('@/lib/auth/mfa-attempts')
    expect(reserveAttempt).not.toHaveBeenCalled()
    expect(store.service.from).not.toHaveBeenCalled()
    expect(store.deleteFactor).not.toHaveBeenCalled()
    expect(userRows(USER).every((row) => row.used_at === null)).toBe(true)
  }

  it('refuses a signed-out caller', async () => {
    const { redirect } = await import('next/navigation')
    session.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
    } as never)
    vi.mocked(store.service.from).mockClear()

    await redeemRecoveryCode({ code: codes[0] })

    expect(redirect).toHaveBeenCalledWith('/login?error=session_expired')
    await expectNothingChecked()
  })

  it('refuses a satisfied (already elevated) caller', async () => {
    const { redirect } = await import('next/navigation')
    await setUp({ currentLevel: 'aal2' })
    vi.mocked(store.service.from).mockClear()

    await redeemRecoveryCode({ code: codes[0] })

    expect(redirect).toHaveBeenCalledWith('/')
    await expectNothingChecked()
  })

  it('refuses an indeterminate caller and ends the pending session', async () => {
    const { redirect } = await import('next/navigation')
    session.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('gotrue down'))
    vi.mocked(store.service.from).mockClear()

    await redeemRecoveryCode({ code: codes[0] })

    expect(redirect).toHaveBeenCalledWith('/login?error=mfa_unavailable')
    expect(session.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    await expectNothingChecked()
  })

  it('rejects a malformed code before resolving anything', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockClear()
    expect(await redeemRecoveryCode({ code: '123456' })).toEqual({
      error: 'Enter a recovery code in the form XXXXX-XXXXX',
    })
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('redeemRecoveryCode — security email', () => {
  it('does not block or undo the recovery when the email fails', async () => {
    const { redirect } = await import('next/navigation')
    const { sendMfaRecoveryNotice } = await import('@/lib/email/send-mfa-recovery-notice')
    vi.mocked(sendMfaRecoveryNotice).mockRejectedValue(new Error('Resend is down'))

    await redeemRecoveryCode({ code: codes[0] })

    expect(sendMfaRecoveryNotice).toHaveBeenCalledTimes(1)
    expect(redirect).toHaveBeenCalledWith(SETTINGS)
    expect(store.factors.get(USER)).toEqual([])
    expect(userRows(USER)).toEqual([])
    expect(session.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(budget.has(USER)).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      '[auth] recovery notice email not sent:',
      expect.any(Error)
    )
  })
})
