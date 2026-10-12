import { redisConnection } from '@/lib/queue/connection'
import { MFA_ATTEMPTS_TTL_SECONDS } from './mfa'

/**
 * Server-side failed-code counter for the TOTP challenge.
 *
 * It used to be the `fd_mfa_attempts` cookie, which was a limit in name only: `httpOnly` keeps a
 * browser script from reading it but does not make a scripted client send it, and an absent (or
 * `0`, or negative) value restarted the count from one on every request. The number also reset on
 * every fresh password sign-in, so waiting out the 10-minute `maxAge` or simply signing in again
 * handed out a new budget.
 *
 * The counter therefore lives in Redis, keyed by the user id that the server itself resolved from
 * the validated access token, with a TTL that acts as the lockout window. Nothing the requester
 * sends can lower it. Redis is already a hard dependency of this process through BullMQ.
 *
 * DEGRADATION: if Redis is unreachable the count cannot be read or written, and this module fails
 * open — the user keeps retrying and Supabase's own MFA throttling is the only remaining bound.
 * Failing closed would turn a Redis outage into a total sign-in outage for every MFA user, which
 * is the worse trade for a self-hosted product. The failure is logged, never silent.
 */

const KEY_PREFIX = 'mfa:attempts:'

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

/** Current failed-attempt count, or 0 when unknown (including when Redis is unreachable). */
export async function readFailedAttempts(userId: string): Promise<number> {
  try {
    const value = await redisConnection.get(key(userId))
    const parsed = Number.parseInt(value ?? '', 10)
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
  } catch (error) {
    console.error('[auth] mfa attempt counter unreadable:', error)
    return 0
  }
}

/**
 * Increments the count and returns the new value. The TTL is refreshed on every failure, so the
 * lockout window runs from the last attempt rather than the first.
 *
 * Returns 0 when Redis is unreachable, which reads as "under the limit" at every call site.
 */
export async function recordFailedAttempt(userId: string): Promise<number> {
  try {
    const next = await redisConnection.incr(key(userId))
    await redisConnection.expire(key(userId), MFA_ATTEMPTS_TTL_SECONDS)
    return next
  } catch (error) {
    console.error('[auth] mfa attempt counter unwritable:', error)
    return 0
  }
}

/**
 * Clears the count. Called only after a code actually verifies — not on sign-out and not on a new
 * password sign-in, because either of those would let the attacker reset their own budget.
 */
export async function clearFailedAttempts(userId: string): Promise<void> {
  try {
    await redisConnection.del(key(userId))
  } catch (error) {
    console.error('[auth] mfa attempt counter not cleared:', error)
  }
}
