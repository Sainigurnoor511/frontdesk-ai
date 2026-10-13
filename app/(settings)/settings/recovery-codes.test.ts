import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getTotpFactorStatus,
  regenerateRecoveryCodes,
  unenrollTotpFactor,
  verifyTotpEnrollment,
} from './actions'
import { consumeRecoveryCode, issueRecoveryCodes } from '@/lib/auth/recovery-codes'
import { createRecoveryStore } from '@/lib/auth/recovery-codes-test-store'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const USER = 'user-1'
const FACTOR = 'factor-1'
const canonical = (code: string) => code.replace('-', '')

let store: ReturnType<typeof createRecoveryStore>
let oldCodes: string[]

async function useSession(options: { currentLevel: 'aal1' | 'aal2'; factors: boolean }) {
  const { createClient, createServiceRoleClient } = await import('@/lib/supabase/server')
  store.factors.set(
    USER,
    options.factors ? [{ id: FACTOR, factor_type: 'totp', status: 'verified' }] : []
  )
  const session = store.session(USER, { currentLevel: options.currentLevel })
  Object.assign(session.auth.mfa, {
    challengeAndVerify: vi.fn(async () => ({ data: {}, error: null })),
  })
  vi.mocked(createClient).mockResolvedValue(session as never)
  vi.mocked(createServiceRoleClient).mockReturnValue(store.service as never)
  return session
}

const consume = (code: string, factorId = FACTOR) =>
  consumeRecoveryCode(store.service as never, USER, canonical(code), [factorId])

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-for-recovery-codes')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store = createRecoveryStore()
  const issued = await issueRecoveryCodes(store.service as never, USER, FACTOR)
  if (!('codes' in issued)) throw new Error('setup')
  oldCodes = issued.codes
  vi.mocked(store.service.from).mockClear()
  store.rpc.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('regenerateRecoveryCodes', () => {
  it('refuses a pending session, without touching the codes', async () => {
    await useSession({ currentLevel: 'aal1', factors: true })
    const before = structuredClone(store.rows)

    expect(await regenerateRecoveryCodes()).toEqual({ error: 'You must be signed in to do this.' })
    expect(store.service.from).not.toHaveBeenCalled()
    expect(store.rpc).not.toHaveBeenCalled()
    expect(store.rows).toEqual(before)
    expect(await consume(oldCodes[0])).toMatchObject({ status: 'consumed' })
  })

  it('refuses a signed-out caller', async () => {
    const session = await useSession({ currentLevel: 'aal2', factors: true })
    session.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
    } as never)

    expect(await regenerateRecoveryCodes()).toEqual({ error: 'You must be signed in to do this.' })
    expect(store.rpc).not.toHaveBeenCalled()
  })

  it('refuses an account with no verified factor', async () => {
    await useSession({ currentLevel: 'aal1', factors: false })

    expect(await regenerateRecoveryCodes()).toEqual({
      error: 'Turn on two-factor authentication first.',
    })
    expect(store.rpc).not.toHaveBeenCalled()
  })

  it('replaces every unused code for a satisfied session, bound to its factor, so the old ones stop working', async () => {
    await useSession({ currentLevel: 'aal2', factors: true })

    const result = await regenerateRecoveryCodes()
    if (!('recoveryCodes' in result)) throw new Error(`expected codes, got ${JSON.stringify(result)}`)

    expect(result.recoveryCodes).toHaveLength(10)
    expect(result.recoveryCodes.some((code) => oldCodes.includes(code))).toBe(false)
    expect(store.rows).toHaveLength(10)
    expect(store.rows.every((row) => row.factor_id === FACTOR)).toBe(true)
    for (const code of oldCodes) expect(await consume(code)).toEqual({ status: 'invalid' })
    expect(await consume(result.recoveryCodes[0])).toMatchObject({ status: 'consumed' })
  })

  // Finding #2, through the action and the status the client re-reads afterwards.
  it('reports a failure and leaves the old set working, with the server count unchanged', async () => {
    await useSession({ currentLevel: 'aal2', factors: true })
    store.failures.rpc = true

    expect(await regenerateRecoveryCodes()).toEqual({
      error: 'Could not generate recovery codes. Please try again.',
    })
    expect(await getTotpFactorStatus()).toMatchObject({ recoveryCodes: { remaining: 10, total: 10 } })
    expect(await consume(oldCodes[0])).toMatchObject({ status: 'consumed' })
  })
})

describe('verifyTotpEnrollment', () => {
  it('issues a fresh set bound to the new factor once it verifies', async () => {
    await useSession({ currentLevel: 'aal1', factors: false })

    const result = await verifyTotpEnrollment('factor-new', '123456')
    if (!('success' in result) || !result.recoveryCodes) throw new Error('expected codes')

    expect(result.recoveryCodes).toHaveLength(10)
    expect(store.rows).toHaveLength(10)
    expect(store.rows.every((row) => row.factor_id === 'factor-new')).toBe(true)
    expect(await consume(result.recoveryCodes[0], 'factor-new')).toMatchObject({ status: 'consumed' })
    // A sheet from the earlier enrolment does not work against the new factor.
    expect(await consume(oldCodes[0], 'factor-new')).toEqual({ status: 'invalid' })
  })

  it('still reports two-factor as on when the codes could not be issued', async () => {
    await useSession({ currentLevel: 'aal1', factors: false })
    store.failures.rpc = true

    expect(await verifyTotpEnrollment('factor-new', '123456')).toEqual({
      success: true,
      recoveryCodes: null,
    })
  })
})

describe('unenrollTotpFactor', () => {
  it('deletes the user’s unused codes along with the factor', async () => {
    const session = await useSession({ currentLevel: 'aal2', factors: true })

    expect(await unenrollTotpFactor(FACTOR)).toEqual({ success: true })
    expect(session.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: FACTOR })
    expect(store.rows).toEqual([])
  })

  it('still succeeds, and logs, when the code delete fails, since binding makes the codes dead anyway', async () => {
    await useSession({ currentLevel: 'aal2', factors: true })
    store.failures.delete = true

    expect(await unenrollTotpFactor(FACTOR)).toEqual({ success: true })
    expect(console.error).toHaveBeenCalledWith('[auth] recovery codes not deleted:', expect.anything())
    expect(store.rows).toHaveLength(10)
    // The factor is gone, so none of those rows can be redeemed.
    expect(store.factors.get(USER)).toEqual([])
  })
})

describe('getTotpFactorStatus', () => {
  it('returns the remaining count with the total from the server', async () => {
    await useSession({ currentLevel: 'aal2', factors: true })
    await consume(oldCodes[0])

    expect(await getTotpFactorStatus()).toEqual({
      enabled: true,
      factorId: FACTOR,
      recoveryCodes: { remaining: 9, total: 10 },
    })
  })

  it('tells "two-factor off" apart from "count unknown"', async () => {
    await useSession({ currentLevel: 'aal2', factors: true })
    store.failures.select = true
    expect(await getTotpFactorStatus()).toEqual({
      enabled: true,
      factorId: FACTOR,
      recoveryCodes: { remaining: null, total: 10 },
    })

    store.failures.select = false
    await useSession({ currentLevel: 'aal1', factors: false })
    expect(await getTotpFactorStatus()).toEqual({ enabled: false, factorId: null, recoveryCodes: null })
  })

  it('does not count codes bound to a factor that is no longer verified', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const session = await useSession({ currentLevel: 'aal2', factors: true })
    store.factors.set(USER, [{ id: 'factor-other', factor_type: 'totp', status: 'verified' }])
    vi.mocked(createClient).mockResolvedValue(session as never)

    expect(await getTotpFactorStatus()).toMatchObject({ recoveryCodes: { remaining: 0, total: 10 } })
  })
})
