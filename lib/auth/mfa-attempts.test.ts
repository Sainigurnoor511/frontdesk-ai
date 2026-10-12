import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  readFailedAttempts,
  recordFailedAttempt,
  clearFailedAttempts,
} from './mfa-attempts'

vi.mock('@/lib/queue/connection', () => ({
  redisConnection: { get: vi.fn(), incr: vi.fn(), expire: vi.fn(), del: vi.fn() },
}))

const { redisConnection: redis } = await import('@/lib/queue/connection')

describe('mfa attempt counter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('namespaces the key by user id, so one user cannot spend another budget', async () => {
    vi.mocked(redis.get).mockResolvedValue('3')

    await expect(readFailedAttempts('u1')).resolves.toBe(3)
    expect(redis.get).toHaveBeenCalledWith('mfa:attempts:u1')
  })

  it('reads an absent counter as zero', async () => {
    vi.mocked(redis.get).mockResolvedValue(null)

    await expect(readFailedAttempts('u1')).resolves.toBe(0)
  })

  it('refuses a negative or non-numeric stored value rather than trusting it', async () => {
    vi.mocked(redis.get).mockResolvedValue('-5')
    await expect(readFailedAttempts('u1')).resolves.toBe(0)

    vi.mocked(redis.get).mockResolvedValue('not-a-number')
    await expect(readFailedAttempts('u1')).resolves.toBe(0)
  })

  it('increments and refreshes the lockout window', async () => {
    vi.mocked(redis.incr).mockResolvedValue(4)

    await expect(recordFailedAttempt('u1')).resolves.toBe(4)
    expect(redis.incr).toHaveBeenCalledWith('mfa:attempts:u1')
    expect(redis.expire).toHaveBeenCalledWith('mfa:attempts:u1', 600)
  })

  it('clears only the one user key', async () => {
    await clearFailedAttempts('u1')

    expect(redis.del).toHaveBeenCalledWith('mfa:attempts:u1')
  })

  it('degrades to zero and logs when Redis is unreachable, rather than rejecting', async () => {
    // Failing closed here would make a Redis outage a sign-in outage for every MFA user; Supabase
    // throttling stays as the remaining bound. The call must never reject, because it runs inside
    // the one action a locked-out user needs.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(redis.get).mockRejectedValue(new Error('ECONNREFUSED'))
    vi.mocked(redis.incr).mockRejectedValue(new Error('ECONNREFUSED'))
    vi.mocked(redis.del).mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(readFailedAttempts('u1')).resolves.toBe(0)
    await expect(recordFailedAttempt('u1')).resolves.toBe(0)
    await expect(clearFailedAttempts('u1')).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalledTimes(3)
    consoleError.mockRestore()
  })
})
