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
