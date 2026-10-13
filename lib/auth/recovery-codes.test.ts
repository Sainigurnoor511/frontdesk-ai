import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
  consumeRecoveryCode,
  generateRecoveryCode,
  issueRecoveryCodes,
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

describe('issueRecoveryCodes', () => {
  it('issues ten distinct codes and stores only their HMAC, never the plaintext', async () => {
    const store = createRecoveryStore()
    const result = await issueRecoveryCodes(store.service as never, 'user-1')
    if (!('codes' in result)) throw new Error('expected codes')

    expect(result.codes).toHaveLength(RECOVERY_CODE_COUNT)
    expect(new Set(result.codes).size).toBe(RECOVERY_CODE_COUNT)
    for (const code of result.codes) expect(code).toMatch(CODE_SHAPE)

    expect(store.rows).toHaveLength(RECOVERY_CODE_COUNT)
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
    const result = await issueRecoveryCodes(store.service as never, 'user-1')
    if (!('codes' in result)) throw new Error('expected codes')
    const canonical = result.codes[0].replace('-', '')

    expect(store.rows.map((row) => row.code_hash)).not.toContain(
      createHash('sha256').update(canonical).digest('hex')
    )
    vi.stubEnv('ENCRYPTION_KEY', 'a-different-server-secret')
    expect(await consumeRecoveryCode(store.service as never, 'user-1', canonical)).toEqual({
      status: 'invalid',
    })
  })

  it('replaces the previous set', async () => {
    const store = createRecoveryStore()
    await issueRecoveryCodes(store.service as never, 'user-1')
    const first = store.rows.map((row) => row.id)
    await issueRecoveryCodes(store.service as never, 'user-1')
    expect(store.rows).toHaveLength(RECOVERY_CODE_COUNT)
    expect(store.rows.some((row) => first.includes(row.id))).toBe(false)
  })

  it('reports unavailable when the write fails', async () => {
    const store = createRecoveryStore()
    store.failures.insert = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await issueRecoveryCodes(store.service as never, 'user-1')).toEqual({
      error: 'unavailable',
    })
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
