import IORedis, { type Redis } from 'ioredis'
import { MFA_ATTEMPTS_TTL_SECONDS, MFA_MAX_ATTEMPTS } from './mfa'

/**
 * Server-side failed-code budget for the TOTP challenge.
 *
 * WHY REDIS, NOT A COOKIE. The budget used to be the `fd_mfa_attempts` cookie, which was a limit in
 * name only: a scripted client simply omits it and the count restarts. It lives in Redis, keyed by
 * the user id the server resolved from the validated access token, with a TTL that is the lockout
 * window. Nothing the requester sends can lower it.
 *
 * RESERVE BEFORE THE PROVIDER CALL. `reserveAttempt()` atomically checks the budget and takes one
 * slot *before* Supabase sees the code, in a single Lua script. Reading the count and recording the
 * failure afterwards let parallel requests at count four all reach `mfa.verify()`. What happens to
 * the slot afterwards is the caller's decision, per outcome — see `verifyMfaChallenge`.
 *
 * NO KEY WITHOUT AN EXPIRY. A reservation creates or updates the counter with `SET … EX` in one
 * command, so no state exists in which the key is present without an expiry. The old `INCR` then
 * `EXPIRE` pair left a count that never expired whenever the second command failed, and the budget
 * precheck then stopped the only code path that would have repaired it. A release writes with
 * `SET … KEEPTTL` (Redis ≥ 6.0), which keeps the expiry the reservation set and never creates a
 * missing key; clearing is `DEL`.
 *
 * OWN CLIENT, BOUNDED. This module does not share BullMQ's connection (`lib/queue/connection.ts`):
 * that one uses `maxRetriesPerRequest: null` with the offline queue on, so during an outage a
 * command queues and retries forever and the caller never gets an error to degrade on — sign-in
 * hung on "Verifying…". This client has the offline queue off, one retry and a command timeout,
 * and every call runs in two bounded phases:
 * 1. Opening the transport (DNS, TCP, TLS), only on a client that has never connected:
 *    `MFA_REDIS_CONNECT_TIMEOUT_MS`. Separate so a healthy cold start against a remote or TLS Redis
 *    is not refused for spending its first second on the handshake. A refused port fails here at
 *    once; an unroutable host takes this whole budget.
 * 2. The Redis handshake (AUTH, ready check) and the command itself: `MFA_REDIS_TIMEOUT_MS`. A
 *    server that accepts the connection but never answers is refused within this bound.
 *
 * DEGRADATION IS FAIL-CLOSED. When Redis cannot be reached, `reserveAttempt()` returns
 * `unavailable` and the action refuses to check the code (the pending session is kept, so the user
 * retries once Redis is back). Deliberate, for three reasons:
 * 1. This counter is the only per-account guessing bound the app controls. Supabase's own
 *    verification throttling is keyed on the calling IP, and the calling IP is this server, so it
 *    is a shared, global limit, not a per-user one.
 * 2. Nobody outside the deployment can cause a Redis outage, so fail-closed is not a lockout
 *    primitive. Fail-open would turn every outage into an unbounded guessing window.
 * 3. The blast radius is small: only the second step of an MFA sign-in is refused. Users without
 *    MFA, and sessions that already passed the challenge, are untouched. Redis is a hard dependency
 *    of the job workers already, so an outage is already an incident.
 * `releaseAttempt()` and `clearAttempts()` only ever *lower* the count, so their failures are
 * logged and swallowed: the worst case is a leftover count that expires with its TTL.
 * `clearAttemptsAfterRecovery()` fails closed on the refill: no claim recorded, no clear.
 */

/** Upper bound on the Redis handshake plus the command, once the transport is open. */
export const MFA_REDIS_TIMEOUT_MS = 1_000

/** Upper bound on opening the transport (DNS, TCP, TLS) on a client that has not connected yet. */
export const MFA_REDIS_CONNECT_TIMEOUT_MS = 3_000

/** A verified recovery link may refill one user's budget at most once per this window. */
export const MFA_RECOVERY_CLEAR_INTERVAL_SECONDS = 60 * 60

const KEY_PREFIX = 'mfa:attempts:'
const RECOVERY_CLAIM_PREFIX = 'mfa:recovery-clear:'

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

function recoveryClaimKey(userId: string): string {
  return `${RECOVERY_CLAIM_PREFIX}${userId}`
}

/**
 * KEYS[1] counter key · ARGV[1] max attempts · ARGV[2] TTL seconds.
 * Returns { 1, count } when a slot was taken (count includes it) and { 0, count } when the budget
 * is already spent. The rejected branch does not refresh the TTL, so a locked-out requester who
 * keeps posting cannot extend the lockout; it only repairs a key that somehow has no TTL, so no
 * lockout can be permanent. A non-numeric value is an error, which the caller treats as
 * `unavailable` (fail closed) rather than as zero.
 */
const RESERVE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local current = 0
if raw then
  current = tonumber(raw)
  if not current then return redis.error_reply('mfa attempt counter is not a number') end
end
if current >= tonumber(ARGV[1]) then
  if redis.call('TTL', KEYS[1]) == -1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
  return { 0, current }
end
redis.call('SET', KEYS[1], current + 1, 'EX', ARGV[2])
return { 1, current + 1 }
`

/**
 * KEYS[1] counter key. Gives one slot back, never below zero. `SET … KEEPTTL` keeps the window the
 * reservation set, and a key that has already expired is left alone rather than recreated.
 */
const RELEASE_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '')
if not current or current <= 0 then return 0 end
redis.call('SET', KEYS[1], current - 1, 'KEEPTTL')
return current - 1
`

let client: Redis | null = null
let connecting: Promise<void> | null = null

function getClient(): Redis {
  if (!client) {
    client = new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      // No connection at import time, so `next build` and Vitest never dial Redis.
      lazyConnect: true,
      // A command issued while disconnected is rejected now, not queued until reconnect. A queued
      // reservation would also land late, after the caller had already given up on it.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      // ioredis clears this timer once the socket connects (`secureConnect` for TLS), so it covers
      // exactly phase 1; the handshake after it is bounded by `bounded()`'s second phase.
      connectTimeout: MFA_REDIS_CONNECT_TIMEOUT_MS,
      commandTimeout: MFA_REDIS_TIMEOUT_MS,
    })
    // Without a listener ioredis prints "Unhandled error event" on every reconnect attempt. The
    // failures themselves surface at the call sites below, which log them.
    client.on('error', () => {})
  }
  return client
}

/**
 * Phase 1. The first call after boot finds the client in `wait`; with the offline queue off, a
 * command in that state would be rejected, so the connect is started once and shared by concurrent
 * callers (`connecting` settles when the client is ready). This resolves as soon as the socket is
 * open — ioredis emits `connect` before it sends AUTH and the ready check — and rejects when the
 * connect fails. Any other state resolves at once: a ready client needs nothing, and one that is
 * reconnecting after an outage fails fast on the command by design.
 */
function transportOpen(redis: Redis): Promise<void> {
  if (redis.status === 'wait' && !connecting) {
    // Clears only its own handle: a connect abandoned by the test hook settles late, and must not
    // wipe out the attempt a fresh client started in the meantime.
    const attempt: Promise<void> = redis.connect().finally(() => {
      if (connecting === attempt) connecting = null
    })
    connecting = attempt
  }
  const pending = connecting
  if (!pending || redis.status !== 'connecting') return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      redis.off('connect', onConnect)
      resolve()
    }
    redis.on('connect', onConnect)
    pending.then(onConnect, (error: unknown) => {
      redis.off('connect', onConnect)
      reject(error)
    })
  })
}

/** Rejects with `message` if `work` has not settled within `ms`. */
async function within<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Runs one counter operation in the two phases described at the top of this file: the transport
 * within `MFA_REDIS_CONNECT_TIMEOUT_MS`, then the handshake and the command within
 * `MFA_REDIS_TIMEOUT_MS`.
 */
async function bounded<T>(run: (redis: Redis) => Promise<T>): Promise<T> {
  const redis = getClient()
  await within(
    transportOpen(redis),
    MFA_REDIS_CONNECT_TIMEOUT_MS,
    `mfa attempt counter could not connect within ${MFA_REDIS_CONNECT_TIMEOUT_MS}ms`
  )
  return within(
    (async () => {
      if (connecting) await connecting
      return run(redis)
    })(),
    MFA_REDIS_TIMEOUT_MS,
    `mfa attempt counter timed out after ${MFA_REDIS_TIMEOUT_MS}ms`
  )
}

export type AttemptReservation =
  /** A slot was taken. `attempts` counts it, so `attempts === MFA_MAX_ATTEMPTS` is the last try. */
  | { status: 'reserved'; attempts: number }
  /** The budget is spent; the code must not reach Supabase. */
  | { status: 'exhausted' }
  /** Redis could not be reached within the bound. Fail closed: do not check the code. */
  | { status: 'unavailable' }

/** Atomically takes one attempt from the user's budget, before the code is sent to Supabase. */
export async function reserveAttempt(userId: string): Promise<AttemptReservation> {
  try {
    const [taken, attempts] = (await bounded((redis) =>
      redis.eval(RESERVE_SCRIPT, 1, key(userId), MFA_MAX_ATTEMPTS, MFA_ATTEMPTS_TTL_SECONDS)
    )) as [number, number]
    return taken === 1 ? { status: 'reserved', attempts } : { status: 'exhausted' }
  } catch (error) {
    console.error('[auth] mfa attempt counter unavailable, refusing verification:', error)
    return { status: 'unavailable' }
  }
}

/**
 * Gives a reserved slot back. Only for outcomes where Supabase provably did not evaluate the code
 * (the challenge call threw, or Supabase throttled the request).
 */
export async function releaseAttempt(userId: string): Promise<void> {
  try {
    await bounded((redis) => redis.eval(RELEASE_SCRIPT, 1, key(userId)))
  } catch (error) {
    console.error('[auth] mfa attempt not released; it stays counted until the window ends:', error)
  }
}

/**
 * Clears the budget. Called only after a code actually verifies — not on sign-out and not on a new
 * password sign-in, because either of those would let the attacker reset their own budget.
 */
export async function clearAttempts(userId: string): Promise<void> {
  try {
    await bounded((redis) => redis.del(key(userId)))
  } catch (error) {
    console.error('[auth] mfa attempt counter not cleared; it expires with its window:', error)
  }
}

export type RecoveryClearOutcome =
  /** The claim was taken and the budget cleared. */
  | 'cleared'
  /** This user's budget was already refilled by a recovery link within the window; left alone. */
  | 'already_claimed'
  /** Redis failed on the claim or the clear. The budget is not refilled. */
  | 'unavailable'

/**
 * Clears the budget after a verified recovery link, at most once per user per
 * `MFA_RECOVERY_CLEAR_INTERVAL_SECONDS`. Each reset link needs only the mailbox, so without this
 * cap the refill rate, and with it the guess rate, would follow the deployment's email quota.
 *
 * The claim is one `SET … NX EX` command: the check and the write cannot race across instances,
 * and the key cannot exist without its expiry. It fails closed on the refill: if the claim cannot
 * be recorded, nothing is cleared, because no refill is the safe direction. A claim that was
 * recorded but whose clear then failed stays spent; that is also no refill. Never rejects.
 */
export async function clearAttemptsAfterRecovery(userId: string): Promise<RecoveryClearOutcome> {
  let claim: string | null
  try {
    claim = await bounded((redis) =>
      redis.set(recoveryClaimKey(userId), '1', 'EX', MFA_RECOVERY_CLEAR_INTERVAL_SECONDS, 'NX')
    )
  } catch (error) {
    console.error('[auth] recovery refill claim not recorded; mfa attempt budget not cleared:', error)
    return 'unavailable'
  }
  if (claim !== 'OK') {
    console.info('[auth] mfa attempt budget already refilled by a recovery link this hour; not cleared', {
      userId,
    })
    return 'already_claimed'
  }
  try {
    await bounded((redis) => redis.del(key(userId)))
  } catch (error) {
    console.error('[auth] mfa attempt counter not cleared after recovery; it expires with its window:', error)
    return 'unavailable'
  }
  return 'cleared'
}

/** Test hook: drops the client so the next call builds a fresh one from `process.env.REDIS_URL`. */
export async function resetMfaAttemptClientForTests(): Promise<void> {
  const current = client
  client = null
  connecting = null
  current?.disconnect()
}
