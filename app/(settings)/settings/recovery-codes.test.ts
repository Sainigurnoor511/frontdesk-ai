import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { regenerateRecoveryCodes, verifyTotpEnrollment } from './actions'
import { consumeRecoveryCode, issueRecoveryCodes } from '@/lib/auth/recovery-codes'
import { createRecoveryStore } from '@/lib/auth/recovery-codes-test-store'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const USER = 'user-1'
const canonical = (code: string) => code.replace('-', '')

let store: ReturnType<typeof createRecoveryStore>
let oldCodes: string[]

async function useSession(options: { currentLevel: 'aal1' | 'aal2'; factors: boolean }) {
  const { createClient, createServiceRoleClient } = await import('@/lib/supabase/server')
  store.factors.set(
    USER,
    options.factors ? [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] : []
  )
  const session = store.session(USER, { currentLevel: options.currentLevel })
  Object.assign(session.auth.mfa, {
    challengeAndVerify: vi.fn(async () => ({ data: {}, error: null })),
  })
  vi.mocked(createClient).mockResolvedValue(session as never)
  vi.mocked(createServiceRoleClient).mockReturnValue(store.service as never)
  return session
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-for-recovery-codes')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store = createRecoveryStore()
  const issued = await issueRecoveryCodes(store.service as never, USER)
  if (!('codes' in issued)) throw new Error('setup')
  oldCodes = issued.codes
  vi.mocked(store.service.from).mockClear()
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
    expect(store.rows).toEqual(before)
    expect(await consumeRecoveryCode(store.service as never, USER, canonical(oldCodes[0]))).toMatchObject({
      status: 'consumed',
    })
  })

  it('refuses a signed-out caller', async () => {
    const session = await useSession({ currentLevel: 'aal2', factors: true })
    session.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
    } as never)

    expect(await regenerateRecoveryCodes()).toEqual({ error: 'You must be signed in to do this.' })
    expect(store.service.from).not.toHaveBeenCalled()
  })

  it('refuses an account with no verified factor', async () => {
    await useSession({ currentLevel: 'aal1', factors: false })

    expect(await regenerateRecoveryCodes()).toEqual({
      error: 'Turn on two-factor authentication first.',
    })
    expect(store.service.from).not.toHaveBeenCalled()
  })

  it('replaces every code for a satisfied session, so the old ones stop working', async () => {
    await useSession({ currentLevel: 'aal2', factors: true })

    const result = await regenerateRecoveryCodes()
    if (!('recoveryCodes' in result)) throw new Error(`expected codes, got ${JSON.stringify(result)}`)

    expect(result.recoveryCodes).toHaveLength(10)
    expect(result.recoveryCodes.some((code) => oldCodes.includes(code))).toBe(false)
    expect(store.rows).toHaveLength(10)
    for (const code of oldCodes) {
      expect(await consumeRecoveryCode(store.service as never, USER, canonical(code))).toEqual({
        status: 'invalid',
      })
    }
    expect(
      await consumeRecoveryCode(store.service as never, USER, canonical(result.recoveryCodes[0]))
    ).toMatchObject({ status: 'consumed' })
  })

  it('reports a failure instead of returning codes that were never stored', async () => {
    await useSession({ currentLevel: 'aal2', factors: true })
    store.failures.insert = true

    expect(await regenerateRecoveryCodes()).toEqual({
      error: 'Could not generate recovery codes. Please try again.',
    })
  })
})

describe('verifyTotpEnrollment', () => {
  it('issues a fresh set once the factor verifies, replacing any left from an earlier one', async () => {
    await useSession({ currentLevel: 'aal1', factors: false })

    const result = await verifyTotpEnrollment('factor-new', '123456')
    if (!('success' in result) || !result.recoveryCodes) throw new Error('expected codes')

    expect(result.recoveryCodes).toHaveLength(10)
    expect(store.rows).toHaveLength(10)
    expect(
      await consumeRecoveryCode(store.service as never, USER, canonical(oldCodes[0]))
    ).toEqual({ status: 'invalid' })
  })

  it('still reports two-factor as on when the codes could not be issued', async () => {
    await useSession({ currentLevel: 'aal1', factors: false })
    store.failures.delete = true

    expect(await verifyTotpEnrollment('factor-new', '123456')).toEqual({
      success: true,
      recoveryCodes: null,
    })
  })
})
