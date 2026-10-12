import IORedis from 'ioredis'

/**
 * True when a Redis at `url` answers PING within `timeoutMs`. Used as a skip gate: the TOTP code
 * step fails closed without Redis, so a spec that needs it would otherwise fail inside its first
 * sign-in and read as a broken login rather than a missing service. Never throws.
 */
export async function redisReachable(url: string, timeoutMs = 1_000): Promise<boolean> {
  const redis = new IORedis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    connectTimeout: timeoutMs,
    commandTimeout: timeoutMs,
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
