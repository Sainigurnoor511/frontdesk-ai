// One-time rollout backfill for appointment reminders, run from the job worker's
// boot path. Service-role only: no `next/headers`, no `server-only` imports.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redisConnection } from '@/lib/queue/connection'
import { scheduleAppointmentReminder } from '@/lib/notifications/dispatch'

/**
 * Bumping the suffix re-runs the backfill on the next worker boot. Scheduling is
 * idempotent (`addNotificationJob()` replaces the job under the fixed id, and
 * delivery is claimed in the database), so a re-run costs Redis writes and
 * nothing else.
 */
const BACKFILL_KEY_PREFIX = 'notify:reminder-backfill:v1'

/**
 * Written only once the scan has finished. Its absence is what makes a worker
 * killed mid-scan retry on the next boot: the old single key was set *before*
 * the scan with no TTL, so a SIGKILL left every unreached appointment
 * unreminded for good.
 */
const DONE_KEY = `${BACKFILL_KEY_PREFIX}:done`

/**
 * Concurrency only: stops two containers booting together from both scanning.
 * Short-lived and refreshed while the scan runs, so a killed scanner frees it
 * within one TTL.
 */
const LOCK_KEY = `${BACKFILL_KEY_PREFIX}:lock`
export const BACKFILL_LOCK_TTL_SECONDS = 60

/** Refresh the lock this often (in rows) while scanning. */
const LOCK_REFRESH_EVERY = 100

/**
 * A worker that finds the lock held waits for it rather than giving up: after a
 * SIGKILL the restarted container boots within seconds, while the dead
 * scanner's lock still has most of its TTL left. Bounded, so a scan that is
 * genuinely running elsewhere is left to finish.
 */
const LOCK_WAIT_ATTEMPTS = 5
const LOCK_WAIT_MS = (BACKFILL_LOCK_TTL_SECONDS * 1_000) / 2

/**
 * Appointments are read oldest-start-first and capped. An org with more future
 * appointments than this gets the nearest ones reminded; the rest are picked up
 * by any later write that touches them. The cap exists so a large tenant cannot
 * turn worker boot into a multi-minute Redis flood.
 */
const BACKFILL_LIMIT = 2_000

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

type BackfillResult = { skipped: true } | { scheduled: number; scanned: number }

/**
 * Schedules reminders for appointments that already existed when reminder
 * delivery shipped.
 *
 * Without this, every booking made before the feature landed silently goes
 * unreminded forever: nothing re-reads the appointments table, and the only
 * paths that enqueue a reminder are writes. Runs once per key version: a
 * completion marker written after the scan, and a short-TTL lock while it runs.
 *
 * Every org is scheduled, whatever its reminder preference: that toggle
 * controls the email, and the in-app reminder is written regardless.
 *
 * Never throws: a failed backfill must not stop the worker from booting.
 */
export async function reconcileAppointmentReminders(
  sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<BackfillResult> {
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`

  try {
    for (let attempt = 0; attempt < LOCK_WAIT_ATTEMPTS; attempt += 1) {
      if (await redisConnection.get(DONE_KEY)) return { skipped: true }

      const locked = await redisConnection.set(
        LOCK_KEY,
        token,
        'EX',
        BACKFILL_LOCK_TTL_SECONDS,
        'NX'
      )
      if (locked === 'OK') return await scanAndSchedule(token)

      await sleep(LOCK_WAIT_MS)
    }

    console.warn('[notifications] reminder backfill lock still held; leaving it to its holder')
    return { skipped: true }
  } catch (error) {
    console.error('[notifications] reminder backfill failed:', error)
    return { skipped: true }
  } finally {
    // Only our own lock: if it expired and another worker took it, leave theirs.
    const holder = await redisConnection.get(LOCK_KEY).catch(() => null)
    if (holder === token) await redisConnection.del(LOCK_KEY).catch(() => undefined)
  }
}

async function scanAndSchedule(token: string): Promise<BackfillResult> {
  // Only appointments far enough out to still earn a reminder — inside the
  // 24h lead `scheduleAppointmentReminder()` would skip them anyway.
  const cutoff = new Date(Date.now() + REMINDER_LEAD_MS).toISOString()
  const { data, error } = await createServiceRoleClient()
    .from('appointments')
    .select('id, organization_id, starts_at')
    .gt('starts_at', cutoff)
    .neq('status', 'cancelled')
    .order('starts_at')
    .limit(BACKFILL_LIMIT)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as { id: string; organization_id: string; starts_at: string }[]
  let scheduled = 0

  for (const row of rows) {
    if (scheduled > 0 && scheduled % LOCK_REFRESH_EVERY === 0) {
      // Still ours? Keep it. Lost it (a stall longer than the TTL)? Carry on —
      // scheduling is idempotent, so a second scanner costs only Redis writes.
      if ((await redisConnection.get(LOCK_KEY)) === token) {
        await redisConnection.expire(LOCK_KEY, BACKFILL_LOCK_TTL_SECONDS)
      }
    }

    await scheduleAppointmentReminder(row.organization_id, row.id, row.starts_at)
    scheduled += 1
  }

  // Only now: a scan that did not reach this line must run again.
  await redisConnection.set(DONE_KEY, new Date().toISOString())

  console.log(
    `[notifications] reminder backfill scheduled ${scheduled} of ${rows.length} future appointment(s)`
  )
  return { scheduled, scanned: rows.length }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    // A worker shutting down must not be held open by the wait.
    timer.unref?.()
  })
}
