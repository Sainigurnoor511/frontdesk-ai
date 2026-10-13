// @vitest-environment node
// Node rather than jsdom: this file constructs Next server primitives (NextRequest / NextResponse).
//
// The per-user hourly cap on recovery refills, exercised through /callback with the real
// `lib/auth/mfa-attempts` module. Only the Redis client underneath it is replaced, by an in-memory
// fake that applies the refill script's semantics (and `SET … EX … NX` / `DEL` the way Redis does),
// so these tests see the commands the module actually sends rather than a mock of the module.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import {
  MFA_RECOVERY_CLEAR_INTERVAL_SECONDS,
  resetMfaAttemptClientForTests,
} from '@/lib/auth/mfa-attempts'

const redis = vi.hoisted(() => ({
  /** key → value and TTL in seconds (`null` = no expiry). */
  store: new Map<string, { value: string; ttl: number | null }>(),
  /** Command names that reject as if Redis were unreachable; `*` fails every command. */
  failing: new Set<string>(),
  /** Every command sent, in order, as [name, ...args]. */
  commands: [] as unknown[][],
}))

vi.mock('ioredis', () => {
  class FakeRedis {
    status = 'ready'
    on() {
      return this
    }
    off() {
      return this
    }
    disconnect() {}
    async connect() {}

    private record(name: string, args: unknown[]) {
      redis.commands.push([name, ...args])
      if (redis.failing.has('*') || redis.failing.has(name)) {
        throw new Error('connect ECONNREFUSED 127.0.0.1:6379')
      }
    }

    async set(key: string, value: string, ...options: unknown[]) {
      this.record('set', [key, value, ...options])
      let ttl: number | null = null
      let onlyIfAbsent = false
      for (let i = 0; i < options.length; i++) {
        const option = String(options[i]).toUpperCase()
        if (option === 'EX') ttl = Number(options[++i])
        else if (option === 'NX') onlyIfAbsent = true
      }
      if (onlyIfAbsent && redis.store.has(key)) return null
      redis.store.set(key, { value: String(value), ttl })
      return 'OK'
    }

    async del(...keys: string[]) {
      this.record('del', keys)
      return keys.filter((key) => redis.store.delete(key)).length
    }

    /**
     * The only script this path sends is the recovery refill (two keys: counter, claim). Applied
     * here with the semantics of `RECOVERY_CLEAR_SCRIPT`; the script itself runs against a real
     * Redis in lib/auth/mfa-attempts.test.ts.
     */
    async eval(_script: string, numKeys: number, ...rest: unknown[]) {
      this.record('eval', [numKeys, ...rest])
      const [counterKey, claim, ttl] = rest.map(String)
      const counter = redis.store.get(counterKey)
      if (!counter || counter.value === '0') return 0
      if (redis.store.has(claim)) return 1
      redis.store.set(claim, { value: '1', ttl: Number(ttl) })
      redis.store.delete(counterKey)
      return 2
    }

    async expire(key: string, seconds: number) {
      // A TTL added by a second command is exactly what can go missing; the claim must not need it.
      this.record('expire', [key, seconds])
      throw new Error('EXPIRE failed')
    }
  }
  return { default: FakeRedis }
})

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/lib/data/organization-slug', () => ({
  generateUniqueSlug: vi.fn(async () => 'acme'),
}))

const nowSeconds = () => Math.floor(Date.now() / 1000)
const totpFactor = { id: 'factor-1', factor_type: 'totp', status: 'verified' }
const budgetKey = (userId: string) => `mfa:attempts:${userId}`
const claimKey = (userId: string) => `mfa:recovery-clear:${userId}`

/** A user who has a verified TOTP factor and is opening a verified reset link. */
async function signInWithRecoveryLink(userId: string) {
  const { createServerClient } = await import('@supabase/ssr')
  const { createServiceRoleClient } = await import('@/lib/supabase/server')
  vi.mocked(createServiceRoleClient).mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: 'member-1' }, error: null }) }),
      }),
    }),
  } as never)

  const user = { id: userId, email: `${userId}@example.com`, factors: [totpFactor] }
  vi.mocked(createServerClient).mockReturnValue({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { user, session: { access_token: 'issued.access.token' } },
        error: null,
      }),
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: { sub: userId, amr: [{ method: 'recovery', timestamp: nowSeconds() }] },
          header: {},
          signature: new Uint8Array(),
        },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: 'aal1', nextLevel: null },
          error: null,
        }),
      },
    },
  } as never)

  const response = await GET(
    new NextRequest(new URL('/callback?code=abc&flow=recovery', 'https://app.example.com'))
  )
  return response.headers.get('location')
}

/** Someone holding the password has spent all five codes. */
function burnBudget(userId: string) {
  redis.store.set(budgetKey(userId), { value: '5', ttl: 600 })
}

describe('GET /callback — at most one recovery refill per user per hour', () => {
  beforeEach(async () => {
    await resetMfaAttemptClientForTests()
    redis.store.clear()
    redis.failing.clear()
    redis.commands.length = 0
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clears the budget for the first reset link and not for a second one within the hour', async () => {
    burnBudget('u1')
    expect(await signInWithRecoveryLink('u1')).toBe('https://app.example.com/verify')
    expect(redis.store.has(budgetKey('u1'))).toBe(false)

    // Burned again, then another reset link from the same mailbox inside the hour.
    burnBudget('u1')
    expect(await signInWithRecoveryLink('u1')).toBe('https://app.example.com/verify')

    expect(redis.store.get(budgetKey('u1'))?.value).toBe('5')
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('already refilled'),
      expect.objectContaining({ userId: 'u1' })
    )
  })

  it("keys the cap per user: another user's refill is not blocked by the first user's claim", async () => {
    burnBudget('u1')
    burnBudget('u2')
    await signInWithRecoveryLink('u1')

    await signInWithRecoveryLink('u2')
    expect(redis.store.has(budgetKey('u2'))).toBe(false)

    // u2 now holds its own claim, so its own second link within the hour does not refill.
    burnBudget('u2')
    await signInWithRecoveryLink('u2')
    expect(redis.store.get(budgetKey('u2'))?.value).toBe('5')
  })

  it('spends no claim when there is no counter to clear, so a later lockout in the hour still refills', async () => {
    // A reset link opened with a full budget used to take the hour's only refill anyway, so a
    // genuine lockout later in the same hour got nothing back.
    expect(await signInWithRecoveryLink('u1')).toBe('https://app.example.com/verify')
    expect(redis.store.has(claimKey('u1'))).toBe(false)
    expect(redis.store.has(budgetKey('u1'))).toBe(false)

    burnBudget('u1')
    await signInWithRecoveryLink('u1')
    expect(redis.store.has(budgetKey('u1'))).toBe(false)
    expect(redis.store.get(claimKey('u1'))?.ttl).toBe(MFA_RECOVERY_CLEAR_INTERVAL_SECONDS)
  })

  it('does not clear the budget when the refill cannot run, and still completes the callback', async () => {
    // The refill fails as if Redis were unreachable, while a DEL would still have gone through:
    // a fail-open refill would show up here as a cleared budget.
    burnBudget('u1')
    redis.failing.add('eval')

    expect(await signInWithRecoveryLink('u1')).toBe('https://app.example.com/verify')

    expect(redis.store.get(budgetKey('u1'))?.value).toBe('5')
    expect(redis.store.has(claimKey('u1'))).toBe(false)
    expect(console.error).toHaveBeenCalled()

    // A full outage: nothing answers, and the reset flow still reaches the code step.
    redis.failing.add('*')
    expect(await signInWithRecoveryLink('u1')).toBe('https://app.example.com/verify')
  })

  it('writes the claim with its expiry in the same command, so it can never lack a TTL', async () => {
    burnBudget('u1')
    await signInWithRecoveryLink('u1')

    expect(redis.store.get(claimKey('u1'))?.ttl).toBe(MFA_RECOVERY_CLEAR_INTERVAL_SECONDS)
    expect(MFA_RECOVERY_CLEAR_INTERVAL_SECONDS).toBe(60 * 60)
    expect(redis.commands.some(([name]) => name === 'expire')).toBe(false)

    // A refused second claim leaves the original key and its expiry untouched.
    await signInWithRecoveryLink('u1')
    expect(redis.store.get(claimKey('u1'))).toEqual({
      value: '1',
      ttl: MFA_RECOVERY_CLEAR_INTERVAL_SECONDS,
    })
  })
})
