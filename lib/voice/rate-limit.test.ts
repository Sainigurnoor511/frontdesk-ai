import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map<string, number>()

vi.mock('@/lib/queue/connection', () => ({
  redisConnection: {
    incr: vi.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1
      store.set(key, next)
      return next
    }),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => 3600),
  },
}))

import { checkAndConsumeRateLimit } from './rate-limit'

beforeEach(() => store.clear())

describe('checkAndConsumeRateLimit', () => {
  it('allows requests under the max', async () => {
    const result = await checkAndConsumeRateLimit('ip:1.2.3.4', { max: 3, windowSeconds: 3600 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('blocks requests once max is reached', async () => {
    await checkAndConsumeRateLimit('ip:1.2.3.4', { max: 2, windowSeconds: 3600 })
    await checkAndConsumeRateLimit('ip:1.2.3.4', { max: 2, windowSeconds: 3600 })
    const third = await checkAndConsumeRateLimit('ip:1.2.3.4', { max: 2, windowSeconds: 3600 })
    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
  })
})
