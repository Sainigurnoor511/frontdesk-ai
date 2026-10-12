// One-time rollout backfill for appointment reminders, run from the job worker's
// boot path. Service-role only: no `next/headers`, no `server-only` imports.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redisConnection } from '@/lib/queue/connection'
import {
  getNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/data/organization-settings-service'
import { scheduleAppointmentReminder } from '@/lib/notifications/dispatch'

/**
 * Bumping the suffix re-runs the backfill on the next worker boot. Scheduling is
 * idempotent (`addNotificationJob()` replaces the job under the fixed id, and
 * delivery is claimed in the database), so a re-run costs Redis writes and
 * nothing else.
 */
const BACKFILL_KEY = 'notify:reminder-backfill:v1'

/**
 * Appointments are read oldest-start-first and capped. An org with more future
 * appointments than this gets the nearest ones reminded; the rest are picked up
 * by any later write that touches them. The cap exists so a large tenant cannot
 * turn worker boot into a multi-minute Redis flood.
 */
const BACKFILL_LIMIT = 2_000

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

/**
 * Schedules reminders for appointments that already existed when reminder
 * delivery shipped.
 *
 * Without this, every booking made before the feature landed silently goes
 * unreminded forever: nothing re-reads the appointments table, and the only
 * paths that enqueue a reminder are writes. Guarded by a Redis key so a worker
 * restart (or a second worker container) does not repeat the scan.
 *
 * Never throws: a failed backfill must not stop the worker from booting.
 */
export async function reconcileAppointmentReminders(): Promise<
  { skipped: true } | { scheduled: number; scanned: number }
> {
  try {
    const claimed = await redisConnection.set(BACKFILL_KEY, new Date().toISOString(), 'NX')
    if (claimed !== 'OK') return { skipped: true }

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
    // One preferences read per org rather than one per appointment.
    const preferences = new Map<string, NotificationPreferences>()
    let scheduled = 0

    for (const row of rows) {
      let resolved = preferences.get(row.organization_id)
      if (!resolved) {
        resolved = await getNotificationPreferences(row.organization_id)
        preferences.set(row.organization_id, resolved)
      }
      if (!resolved.notifyAppointmentReminders) continue

      await scheduleAppointmentReminder(row.organization_id, row.id, row.starts_at, resolved)
      scheduled += 1
    }

    console.log(
      `[notifications] reminder backfill scheduled ${scheduled} of ${rows.length} future appointment(s)`
    )
    return { scheduled, scanned: rows.length }
  } catch (error) {
    // Release the guard so the next boot retries rather than skipping forever.
    await redisConnection.del(BACKFILL_KEY).catch(() => undefined)
    console.error('[notifications] reminder backfill failed:', error)
    return { skipped: true }
  }
}
