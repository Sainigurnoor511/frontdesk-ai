import { redisConnection } from '@/lib/queue/connection'

export async function checkAndConsumeRateLimit(
  key: string,
  opts: { max: number; windowSeconds: number }
): Promise<{ allowed: boolean; remaining: number }> {
  const count = await redisConnection.incr(key)
  if (count === 1) {
    await redisConnection.expire(key, opts.windowSeconds)
  }

  const remaining = Math.max(0, opts.max - count)
  return { allowed: count <= opts.max, remaining }
}

/**
 * Takes a one-shot marker, so work that can be re-entered charges a rate limit
 * once per *event* rather than once per attempt.
 *
 * `checkAndConsumeRateLimit` is a bare `INCR`: a retried job consumes a token
 * every time it runs. Guarding it with this means a notification that fails
 * three times against a flapping provider spends one token, not three.
 *
 * Returns true for the caller that created the marker.
 */
export async function claimRateLimitCharge(key: string, ttlSeconds: number): Promise<boolean> {
  const result = await redisConnection.set(key, '1', 'EX', ttlSeconds, 'NX')
  return result === 'OK'
}

/** Drops the marker, so the next attempt re-evaluates the limit from scratch. */
export async function releaseRateLimitCharge(key: string): Promise<void> {
  await redisConnection.del(key)
}

/**
 * Seconds until a window key expires, for scheduling work past the boundary.
 * `TTL` returns -1 for a key with no expiry and -2 for a missing key; both come
 * back as 0 so the caller falls back to its own floor.
 */
export async function rateLimitWindowSecondsRemaining(key: string): Promise<number> {
  const ttl = await redisConnection.ttl(key)
  return ttl > 0 ? ttl : 0
}
