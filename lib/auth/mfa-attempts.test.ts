// @vitest-environment node
// Node, not jsdom: these tests open real TCP sockets. Nothing here mocks the Redis client — the
// round-1 suite did, with promises that rejected instantly, and so could not see that the real
// connection policy never rejected at all.
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import IORedis, { type Redis } from 'ioredis'
import {
  reserveAttempt,
  releaseAttempt,
  clearAttempts,
  resetMfaAttemptClientForTests,
  MFA_REDIS_TIMEOUT_MS,
} from './mfa-attempts'

const ORIGINAL_REDIS_URL = process.env.REDIS_URL

// Generous slack over the bound for a loaded CI box, but far below "hangs forever".
const WITHIN_BOUND_MS = MFA_REDIS_TIMEOUT_MS + 750

async function useRedisUrl(url: string) {
  await resetMfaAttemptClientForTests()
  process.env.REDIS_URL = url
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; elapsed: number }> {
  const startedAt = Date.now()
  const value = await run()
  return { value, elapsed: Date.now() - startedAt }
}

afterAll(async () => {
  await resetMfaAttemptClientForTests()
  process.env.REDIS_URL = ORIGINAL_REDIS_URL
})

describe('mfa attempt counter — Redis down', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeAll(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    consoleError.mockRestore()
  })

  afterEach(async () => {
    await resetMfaAttemptClientForTests()
  })

  it('fails closed within the bound when nothing is listening', async () => {
    // A port that was just freed: the connection is refused. Under BullMQ's policy
    // (`maxRetriesPerRequest: null`, offline queue on) the command is queued and retried forever.
    const port = await new Promise<number>((resolve) => {
      const probe = net.createServer().listen(0, '127.0.0.1', () => {
        const { port } = probe.address() as net.AddressInfo
        probe.close(() => resolve(port))
      })
    })
    await useRedisUrl(`redis://127.0.0.1:${port}`)

    const reserve = await timed(() => reserveAttempt('u1'))
    expect(reserve.value).toEqual({ status: 'unavailable' })
    expect(reserve.elapsed).toBeLessThan(WITHIN_BOUND_MS)

    // Every call degrades within the bound, never by hanging, and none of them reject.
    const release = await timed(() => releaseAttempt('u1'))
    const clear = await timed(() => clearAttempts('u1'))
    expect(release.elapsed).toBeLessThan(WITHIN_BOUND_MS)
    expect(clear.elapsed).toBeLessThan(WITHIN_BOUND_MS)
    expect(consoleError).toHaveBeenCalled()
  }, 10_000)

  describe('when the server accepts connections but never answers', () => {
    let server: net.Server
    const sockets = new Set<net.Socket>()

    beforeAll(async () => {
      server = net.createServer((socket) => {
        // Swallow everything: no RESP reply, ever. The stalled-server case a timeout must cover.
        sockets.add(socket)
        socket.on('data', () => {})
        socket.on('error', () => {})
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    })

    afterAll(async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    })

    it('fails closed within the bound instead of waiting on the reply', async () => {
      const { port } = server.address() as net.AddressInfo
      await useRedisUrl(`redis://127.0.0.1:${port}`)

      const reserve = await timed(() => reserveAttempt('u1'))

      expect(reserve.value).toEqual({ status: 'unavailable' })
      expect(reserve.elapsed).toBeLessThan(WITHIN_BOUND_MS)
    }, 10_000)
  })
})

// The script's guarantees (atomicity, TTL on every write) are properties of the Redis server
// executing it, so they are asserted against a real one. Point MFA_REDIS_TEST_URL at a disposable
// database to run them; the default is DB 15 of a local Redis. Keys are per-test random user ids
// and are deleted afterwards. Skipped, with this reason, when no server answers.
const LIVE_URL = process.env.MFA_REDIS_TEST_URL ?? 'redis://127.0.0.1:6379/15'

async function probe(url: string): Promise<boolean> {
  const redis = new IORedis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    connectTimeout: 500,
    retryStrategy: () => null,
  })
  redis.on('error', () => {})
  try {
    await redis.connect()
    return (await redis.ping()) === 'PONG'
  } catch {
    return false
  } finally {
    redis.disconnect()
  }
}

const liveAvailable = await probe(LIVE_URL)

describe.skipIf(!liveAvailable)('mfa attempt counter — live Redis (MFA_REDIS_TEST_URL)', () => {
  let admin: Redis
  let userId: string
  const keyFor = (id: string) => `mfa:attempts:${id}`

  beforeAll(async () => {
    admin = new IORedis(LIVE_URL, { maxRetriesPerRequest: 1 })
    await useRedisUrl(LIVE_URL)
  })

  afterAll(async () => {
    admin.disconnect()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await admin.del(keyFor(userId))
  })

  function newUser() {
    userId = `test-${randomUUID()}`
    return userId
  }

  it('reserves up to the budget, then refuses, with a TTL on the key the whole time', async () => {
    const id = newUser()

    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(reserveAttempt(id)).resolves.toEqual({ status: 'reserved', attempts: attempt })
      expect(await admin.ttl(keyFor(id))).toBeGreaterThan(0)
    }
    await expect(reserveAttempt(id)).resolves.toEqual({ status: 'exhausted' })
    expect(await admin.get(keyFor(id))).toBe('5')
  })

  it('never leaves a key without an expiry, even when a separate EXPIRE would fail', async () => {
    // The round-1 bug: INCR created the key with no TTL, EXPIRE then failed, and the count never
    // expired — a permanent lockout. Every EXPIRE this client could issue now fails; the key must
    // still carry a TTL, because the write and its expiry are one command.
    const id = newUser()
    const failingExpire = vi
      .spyOn(IORedis.prototype, 'expire')
      .mockRejectedValue(new Error('EXPIRE failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await reserveAttempt(id)

    expect(await admin.exists(keyFor(id))).toBe(1)
    expect(await admin.ttl(keyFor(id))).not.toBe(-1)
    expect(await admin.ttl(keyFor(id))).toBeGreaterThan(0)
    failingExpire.mockRestore()
  })

  it('repairs a count that somehow has no TTL, so no lockout is permanent', async () => {
    const id = newUser()
    await admin.set(keyFor(id), '5')

    await expect(reserveAttempt(id)).resolves.toEqual({ status: 'exhausted' })

    expect(await admin.ttl(keyFor(id))).toBeGreaterThan(0)
  })

  it('does not extend the lockout when a locked-out requester keeps posting', async () => {
    const id = newUser()
    await admin.set(keyFor(id), '5', 'EX', 30)

    await reserveAttempt(id)
    await reserveAttempt(id)

    expect(await admin.ttl(keyFor(id))).toBeLessThanOrEqual(30)
  })

  it('lets exactly the remaining budget through under concurrent reservations', async () => {
    // Several independent clients, as several app instances would be, all racing on one user.
    const id = newUser()
    await admin.set(keyFor(id), '3', 'EX', 600)
    const instances = await Promise.all(
      Array.from({ length: 4 }, async () => {
        vi.resetModules()
        return import('./mfa-attempts')
      })
    )

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => instances[i % instances.length].reserveAttempt(id))
    )

    expect(results.filter((r) => r.status === 'reserved')).toHaveLength(2)
    expect(results.filter((r) => r.status === 'exhausted')).toHaveLength(10)
    expect(await admin.get(keyFor(id))).toBe('5')
    await Promise.all(instances.map((instance) => instance.resetMfaAttemptClientForTests()))
  })

  it('releases one slot, keeps the window, and never goes below zero', async () => {
    const id = newUser()
    await reserveAttempt(id)
    await reserveAttempt(id)
    await admin.expire(keyFor(id), 120)

    await releaseAttempt(id)
    expect(await admin.get(keyFor(id))).toBe('1')
    const ttl = await admin.ttl(keyFor(id))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(120)

    await releaseAttempt(id)
    await releaseAttempt(id)
    expect(await admin.get(keyFor(id))).toBe('0')
  })

  it('does not recreate a key that has already expired', async () => {
    const id = newUser()

    await releaseAttempt(id)

    expect(await admin.exists(keyFor(id))).toBe(0)
  })

  it('clears only the one user key', async () => {
    const id = newUser()
    const other = `test-${randomUUID()}`
    await reserveAttempt(id)
    await reserveAttempt(other)

    await clearAttempts(id)

    expect(await admin.exists(keyFor(id))).toBe(0)
    expect(await admin.get(keyFor(other))).toBe('1')
    await admin.del(keyFor(other))
  })

  it('fails closed on a corrupted counter rather than reading it as zero', async () => {
    const id = newUser()
    await admin.set(keyFor(id), 'not-a-number', 'EX', 60)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(reserveAttempt(id)).resolves.toEqual({ status: 'unavailable' })
  })
})
