import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
  deleteUnusedRecoveryCodes,
  generateRecoveryCode,
  issueRecoveryCodes,
  removeTotpFactors,
  restoreRecoveryCode,
} from './recovery-codes'
import { createRecoveryStore } from './recovery-codes-test-store'
import { recoveryCodeSchema } from '@/lib/validations/auth'

const CODE_SHAPE = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/

/** The documented derivation, computed independently of `lib/crypto.ts`. */
function expectedHash(canonical: string): string {
  const aesKey = createHash('sha256').update(process.env.ENCRYPTION_KEY!).digest().subarray(0, 32)
  const subkey = createHmac('sha256', aesKey).update('frontdesk:mfa-recovery-code').digest()
  return createHmac('sha256', subkey).update(canonical, 'utf8').digest('hex')
}

beforeEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-for-recovery-codes')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generateRecoveryCode', () => {
  it('uses the 32-symbol Crockford alphabet, without I, L, O or U', () => {
    expect(RECOVERY_CODE_ALPHABET).toHaveLength(32)
    expect(new Set(RECOVERY_CODE_ALPHABET).size).toBe(32)
    expect(RECOVERY_CODE_ALPHABET).not.toMatch(/[ILOU]/)
  })

  it('renders XXXXX-XXXXX with at least 50 bits of entropy', () => {
    const code = generateRecoveryCode()
    expect(code).toMatch(CODE_SHAPE)
    const symbols = code.replace('-', '').length
    expect(symbols * Math.log2(RECOVERY_CODE_ALPHABET.length)).toBeGreaterThanOrEqual(50)
  })

  it('draws every symbol uniformly from the CSPRNG, so the entropy is real', () => {
    // 4000 codes = 40,000 symbols, ~1250 per symbol if uniform. A biased or truncated source
    // (a constant, a smaller alphabet, Math.random-style repeats) shows up as a missing symbol,
    // a repeat, or a count far from the mean.
    const codes = Array.from({ length: 4000 }, generateRecoveryCode)
    expect(new Set(codes).size).toBe(codes.length)
    const counts = new Map<string, number>()
    for (const symbol of codes.join('').replace(/-/g, '')) {
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
    }
    expect(counts.size).toBe(32)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(1000)
      expect(count).toBeLessThan(1500)
    }
  })
})

const USER = 'user-1'
const FACTOR_A = 'factor-a'
const FACTOR_B = 'factor-b'
const canonical = (code: string) => code.replace('-', '')

async function issue(store: ReturnType<typeof createRecoveryStore>, factorId = FACTOR_A) {
  const result = await issueRecoveryCodes(store.service as never, USER, factorId)
  if (!('codes' in result)) throw new Error('expected codes')
  return result.codes
}

describe('issueRecoveryCodes', () => {
  it('issues ten distinct codes and stores only their HMAC, never the plaintext', async () => {
    const store = createRecoveryStore()
    const result = await issueRecoveryCodes(store.service as never, USER, FACTOR_A)
    if (!('codes' in result)) throw new Error('expected codes')

    expect(result.codes).toHaveLength(RECOVERY_CODE_COUNT)
    expect(new Set(result.codes).size).toBe(RECOVERY_CODE_COUNT)
    for (const code of result.codes) expect(code).toMatch(CODE_SHAPE)

    expect(store.rows).toHaveLength(RECOVERY_CODE_COUNT)
    expect(store.rows.every((row) => row.user_id === USER && row.factor_id === FACTOR_A)).toBe(true)
    const stored = store.rows.map((row) => row.code_hash).sort()
    expect(stored).toEqual(result.codes.map((code) => expectedHash(code.replace('-', ''))).sort())

    // No column of any written row contains a code, dashed or not, in any case.
    const written = JSON.stringify(store.rows).toUpperCase()
    for (const code of result.codes) {
      expect(written).not.toContain(code)
      expect(written).not.toContain(code.replace('-', ''))
    }
  })

  it('keys the hash on ENCRYPTION_KEY, so the table alone cannot test a code', async () => {
    const store = createRecoveryStore()
    const codes = await issue(store)
    const typed = canonical(codes[0])

    expect(store.rows.map((row) => row.code_hash)).not.toContain(
      createHash('sha256').update(typed).digest('hex')
    )
    vi.stubEnv('ENCRYPTION_KEY', 'a-different-server-secret')
    expect(await consumeRecoveryCode(store.service as never, USER, typed, [FACTOR_A])).toEqual({
      status: 'invalid',
    })
  })

  it('replaces the previous set through the one atomic function', async () => {
    const store = createRecoveryStore()
    await issue(store)
    const first = store.rows.map((row) => row.id)
    await issue(store)
    expect(store.rows).toHaveLength(RECOVERY_CODE_COUNT)
    expect(store.rows.some((row) => first.includes(row.id))).toBe(false)
    expect(store.rpc).toHaveBeenLastCalledWith('replace_mfa_recovery_codes', {
      p_user_id: USER,
      p_factor_id: FACTOR_A,
      p_hashes: expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{64}$/)]),
    })
    // Never a delete followed by a separate insert, which a failure in between would leave empty.
    expect(store.service.from).not.toHaveBeenCalled()
  })

  it('keeps used rows as the audit trail when it replaces the set', async () => {
    const store = createRecoveryStore()
    const old = await issue(store)
    expect(await consumeRecoveryCode(store.service as never, USER, canonical(old[0]), [FACTOR_A])).toMatchObject({
      status: 'consumed',
    })
    await issue(store)
    expect(store.rows).toHaveLength(RECOVERY_CODE_COUNT + 1)
    expect(store.rows.filter((row) => row.used_at !== null)).toHaveLength(1)
  })

  // Finding #2: a failed regenerate used to have deleted the old set already.
  it('leaves the old set usable when the replace fails', async () => {
    const store = createRecoveryStore()
    const old = await issue(store)
    store.failures.rpc = true
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await issueRecoveryCodes(store.service as never, USER, FACTOR_A)).toEqual({ error: 'unavailable' })
    expect(store.rows).toHaveLength(RECOVERY_CODE_COUNT)
    expect(await countUnusedRecoveryCodes(store.service as never, USER, [FACTOR_A])).toBe(RECOVERY_CODE_COUNT)
    expect(await consumeRecoveryCode(store.service as never, USER, canonical(old[0]), [FACTOR_A])).toMatchObject({
      status: 'consumed',
    })
  })
})

describe('factor binding', () => {
  // Finding #4: rows were user-scoped, so a sheet from an earlier enrolment outlived its factor.
  it('rejects a code issued for factor A once only factor B is verified, even with A’s rows still there', async () => {
    const store = createRecoveryStore()
    const old = await issue(store, FACTOR_A)
    // Re-enrolled as B; the rows for A were never deleted.
    expect(store.rows.every((row) => row.factor_id === FACTOR_A)).toBe(true)

    expect(await consumeRecoveryCode(store.service as never, USER, canonical(old[0]), [FACTOR_B])).toEqual({
      status: 'invalid',
    })
    expect(store.rows.every((row) => row.used_at === null)).toBe(true)
    expect(await countUnusedRecoveryCodes(store.service as never, USER, [FACTOR_B])).toBe(0)
  })

  it('accepts nothing when the user has no verified factor', async () => {
    const store = createRecoveryStore()
    const codes = await issue(store)
    expect(await consumeRecoveryCode(store.service as never, USER, canonical(codes[0]), [])).toEqual({
      status: 'invalid',
    })
    expect(await countUnusedRecoveryCodes(store.service as never, USER, [])).toBe(0)
  })
})

describe('consumeRecoveryCode when the database answer is lost', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('reports the code intact when the update never ran', async () => {
    const store = createRecoveryStore()
    const codes = await issue(store)
    store.failures.update = 1

    expect(await consumeRecoveryCode(store.service as never, USER, canonical(codes[0]), [FACTOR_A])).toEqual({
      status: 'unavailable',
      codeIntact: true,
    })
    expect(store.rows.every((row) => row.used_at === null)).toBe(true)
  })

  // Finding #3: the update committed, its response was lost, and the code was burned while the
  // user was told to try again with it. The re-read by hash now reports the true state.
  it('finds a committed-but-lost update by hash and does not call the code intact', async () => {
    const store = createRecoveryStore()
    const codes = await issue(store)
    store.failures.updateResponse = 1

    expect(await consumeRecoveryCode(store.service as never, USER, canonical(codes[0]), [FACTOR_A])).toEqual({
      status: 'unavailable',
      codeIntact: false,
    })
    // Not put back: the stamp cannot be told from a concurrent, legitimate redemption's.
    expect(store.rows.filter((row) => row.used_at !== null)).toHaveLength(1)
  })

  it('does not claim the code is intact when it was burned and its state cannot be read back', async () => {
    const store = createRecoveryStore()
    const codes = await issue(store)
    // The consume commits and loses its answer, and the database is gone for the re-read too.
    store.failures.updateResponse = 1
    store.failures.select = 1

    expect(await consumeRecoveryCode(store.service as never, USER, canonical(codes[0]), [FACTOR_A])).toEqual({
      status: 'unavailable',
      codeIntact: false,
    })
    expect(store.rows.filter((row) => row.used_at !== null)).toHaveLength(1)
  })

  it('does not un-use a code that an earlier request had already used', async () => {
    const store = createRecoveryStore()
    const codes = await issue(store)
    await consumeRecoveryCode(store.service as never, USER, canonical(codes[0]), [FACTOR_A])
    const before = structuredClone(store.rows)
    store.failures.update = 1

    expect(await consumeRecoveryCode(store.service as never, USER, canonical(codes[0]), [FACTOR_A])).toEqual({
      status: 'unavailable',
      codeIntact: false,
    })
    expect(store.rows).toEqual(before)
  })
})

describe('restoreRecoveryCode', () => {
  it('reports whether the restore actually happened', async () => {
    const store = createRecoveryStore()
    const codes = await issue(store)
    const consumed = await consumeRecoveryCode(store.service as never, USER, canonical(codes[0]), [FACTOR_A])
    if (consumed.status !== 'consumed') throw new Error('setup')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    store.failures.update = 1
    expect(await restoreRecoveryCode(store.service as never, consumed.id)).toBe(false)
    expect(store.rows.find((row) => row.id === consumed.id)?.used_at).not.toBeNull()

    expect(await restoreRecoveryCode(store.service as never, consumed.id)).toBe(true)
    expect(store.rows.find((row) => row.id === consumed.id)?.used_at).toBeNull()
  })
})

describe('deleteUnusedRecoveryCodes', () => {
  it('deletes the unused codes and keeps the used one', async () => {
    const store = createRecoveryStore()
    const codes = await issue(store)
    await consumeRecoveryCode(store.service as never, USER, canonical(codes[0]), [FACTOR_A])

    expect(await deleteUnusedRecoveryCodes(store.service as never, USER)).toBe(true)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].used_at).not.toBeNull()
  })
})

describe('removeTotpFactors', () => {
  it('tries every TOTP factor, skips others, and reports exactly what was removed', async () => {
    const store = createRecoveryStore()
    store.factors.set(USER, [
      { id: 'factor-1', factor_type: 'totp', status: 'unverified' },
      { id: 'factor-2', factor_type: 'totp', status: 'verified' },
      { id: 'phone-1', factor_type: 'phone', status: 'unverified' },
    ])
    store.failures.deleteFactor = 1
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await removeTotpFactors(store.service as never, USER)).toEqual({
      removed: ['factor-2'],
      failed: true,
    })
    expect(store.deleteFactor).toHaveBeenCalledTimes(2)
    expect(store.factors.get(USER)?.map((factor) => factor.id)).toEqual(['factor-1', 'phone-1'])
  })
})

describe('recoveryCodeSchema', () => {
  it('accepts a code case-insensitively, with or without the dash', () => {
    for (const typed of ['ABCDE-FGHJK', 'abcde-fghjk', 'ABCDEFGHJK', ' abcde fghjk ']) {
      expect(recoveryCodeSchema.parse({ code: typed })).toEqual({ code: 'ABCDEFGHJK' })
    }
  })

  it('maps the Crockford look-alikes to the digits they stand for', () => {
    expect(recoveryCodeSchema.parse({ code: 'oiLlO-00000' })).toEqual({ code: '0111000000' })
  })

  it('rejects anything that is not ten symbols of the alphabet', () => {
    for (const typed of ['', 'ABCDE', 'ABCDE-FGHJKM', 'ABCDE-FGHJU', '123456']) {
      expect(recoveryCodeSchema.safeParse({ code: typed }).success).toBe(false)
    }
  })
})
