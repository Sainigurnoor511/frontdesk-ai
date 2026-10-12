// Periodic, idempotent reconciler: Postgres says what is owed, Redis holds only what is due soon.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  abandonNotificationEmail,
  countNotificationEmails,
  EMAIL_LEASE_MS,
  keysetAfter,
  listOwedNotificationEmails,
  recordNotificationEmailSweep,
  type OwedNotificationEmail,
} from '@/lib/data/notifications-service'
import {
  addNotificationJob,
  anyNotificationJobLive,
  ensureAppointmentReminderJob,
  notificationDeliveryJobIds,
  notificationQueue,
  NOTIFICATION_SWEEP_JOB,
  NOTIFICATION_SWEEP_SCHEDULER_ID,
  type NotificationJobData,
  type ReminderJobOutcome,
} from '@/lib/queue/queues/notification'
import { REMINDER_LEAD_MS, REMINDER_LOOKAHEAD_MS } from '@/lib/notifications/types'

// Bounds Redis-loss damage: a reminder whose job was lost fires at most one interval late.
export const NOTIFICATION_SWEEP_INTERVAL_MS = 5 * 60 * 1000

// Fire times this far in the past are still installed (late), so a lost job is not skipped.
export const REMINDER_SWEEP_GRACE_MS = 30 * 60 * 1000

export const SWEEP_PAGE_SIZE = 500

// Younger pending rows are left to their own job (the longest first delivery is under 3 min).
export const EMAIL_SWEEP_MIN_AGE_MS = 15 * 60 * 1000

// Waits of 15m, 30m, 1h, 2h, 4h, 4h, then 4h to abandon: ~16h, inside Resend's 24h idempotency.
export const EMAIL_SWEEP_MAX_RETRIES = 6
const EMAIL_SWEEP_MAX_WAIT_MS = 4 * 60 * 60 * 1000

export function emailSweepWaitMs(sweepCount: number): number {
  return Math.min(EMAIL_SWEEP_MIN_AGE_MS * 2 ** sweepCount, EMAIL_SWEEP_MAX_WAIT_MS)
}

export type ReminderSweepCounts = Record<ReminderJobOutcome, number> & {
  scanned: number
  notOwed: number
}

export type EmailSweepCounts = {
  owed: number
  requeued: number
  inFlight: number
  backingOff: number
  abandoned: number
}

type AppointmentRow = {
  id: string
  organization_id: string
  starts_at: string
  created_at: string
}

/** Installs, add-if-absent, every reminder whose fire time is in [now - grace, now + look-ahead]. */
export async function sweepAppointmentReminders(
  nowMs: number = Date.now()
): Promise<ReminderSweepCounts> {
  const supabase = createServiceRoleClient()
  const fromStart = new Date(nowMs + REMINDER_LEAD_MS - REMINDER_SWEEP_GRACE_MS).toISOString()
  const toStart = new Date(nowMs + REMINDER_LEAD_MS + REMINDER_LOOKAHEAD_MS).toISOString()
  const counts: ReminderSweepCounts = { scanned: 0, notOwed: 0, added: 0, kept: 0, replaced: 0 }
  let after: AppointmentRow | null = null

  for (;;) {
    let query = supabase
      .from('appointments')
      .select('id, organization_id, starts_at, created_at')
      .neq('status', 'cancelled')
      .gt('starts_at', fromStart)
      .lte('starts_at', toStart)
    if (after) query = query.or(keysetAfter('starts_at', after.starts_at, after.id))

    const { data, error } = await query.order('starts_at').order('id').limit(SWEEP_PAGE_SIZE)
    if (error) throw new Error(`Failed to read appointments for reminders: ${error.message}`)

    const rows = (data ?? []) as AppointmentRow[]
    for (const row of rows) {
      counts.scanned += 1
      const fireAtMs = Date.parse(row.starts_at) - REMINDER_LEAD_MS

      // Booked inside the 24h lead: never reminded, same rule as scheduleAppointmentReminder().
      if (fireAtMs <= nowMs && Date.parse(row.created_at) >= fireAtMs) {
        counts.notOwed += 1
        continue
      }

      const outcome = await ensureAppointmentReminderJob(
        row.organization_id,
        row.id,
        row.starts_at,
        fireAtMs - nowMs
      )
      counts[outcome] += 1
    }

    if (rows.length < SWEEP_PAGE_SIZE) return counts
    after = rows[rows.length - 1]
  }
}

/** Re-queues owed emails nothing is working on; abandons those out of retries. */
export async function sweepOwedEmails(nowMs: number = Date.now()): Promise<EmailSweepCounts> {
  const counts: EmailSweepCounts = {
    owed: 0,
    requeued: 0,
    inFlight: 0,
    backingOff: 0,
    abandoned: 0,
  }
  const createdBefore = new Date(nowMs - EMAIL_SWEEP_MIN_AGE_MS).toISOString()
  let after: OwedNotificationEmail | null = null

  for (;;) {
    const rows = await listOwedNotificationEmails({
      createdBefore,
      after: after ? { createdAt: after.createdAt, id: after.id } : null,
      limit: SWEEP_PAGE_SIZE,
    })

    for (const row of rows) {
      counts.owed += 1
      await sweepOwedEmail(row, nowMs, counts)
    }

    if (rows.length < SWEEP_PAGE_SIZE) return counts
    after = rows[rows.length - 1]
  }
}

async function sweepOwedEmail(
  row: OwedNotificationEmail,
  nowMs: number,
  counts: EmailSweepCounts
): Promise<void> {
  if (row.emailClaimedAt && Date.parse(row.emailClaimedAt) > nowMs - EMAIL_LEASE_MS) {
    counts.inFlight += 1
    return
  }

  const since = Date.parse(row.lastSweptAt ?? row.createdAt)
  if (nowMs - since < emailSweepWaitMs(row.sweepCount)) {
    counts.backingOff += 1
    return
  }

  // A reminder's dedupe key is `<appointment id>:<start>`; uuids carry no colon.
  const subjectId =
    row.type === 'appointment_reminder' ? row.dedupeKey.split(':')[0] : row.dedupeKey

  if (await anyNotificationJobLive(notificationDeliveryJobIds(row.type, subjectId, row.sweepCount))) {
    counts.inFlight += 1
    return
  }

  if (row.sweepCount >= EMAIL_SWEEP_MAX_RETRIES) {
    if (await abandonNotificationEmail(row.id)) {
      counts.abandoned += 1
      console.error(
        `[notifications] ABANDONED the ${row.type} email for notification ${row.id} (org ${row.organizationId}) after ${row.sweepCount} sweep retries; check RESEND_API_KEY / RESEND_FROM_EMAIL / NEXT_PUBLIC_SITE_URL and the worker's failed jobs`
      )
    }
    return
  }

  // Counted first, conditionally, so two overlapping sweeps cannot both re-queue one row.
  if (!(await recordNotificationEmailSweep(row.id, row.sweepCount, new Date(nowMs).toISOString()))) {
    return
  }

  await addNotificationJob({
    organizationId: row.organizationId,
    type: row.type,
    subjectId,
    sweepAttempt: row.sweepCount + 1,
  })
  counts.requeued += 1
}

/** One sweep. Each half runs even if the other fails; a failure is rethrown afterwards. */
export async function runNotificationSweep(nowMs: number = Date.now()): Promise<{
  reminders: ReminderSweepCounts | null
  emails: EmailSweepCounts | null
  pending: number | null
  abandoned: number | null
}> {
  const failures: unknown[] = []
  const attempt = async <T>(label: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run()
    } catch (error) {
      console.error(`[notifications] sweep: ${label} failed:`, error)
      failures.push(error)
      return null
    }
  }

  const reminders = await attempt('reminders', () => sweepAppointmentReminders(nowMs))
  const emails = await attempt('emails', () => sweepOwedEmails(nowMs))
  const pending = await attempt('pending count', () => countNotificationEmails('pending'))
  const abandoned = await attempt('abandoned count', () => countNotificationEmails('abandoned'))

  console.log(
    `[notifications] sweep: reminders ${
      reminders
        ? `scanned=${reminders.scanned} added=${reminders.added} replaced=${reminders.replaced} kept=${reminders.kept}`
        : 'failed'
    }; emails ${
      emails
        ? `owed=${emails.owed} requeued=${emails.requeued} in_flight=${emails.inFlight} backing_off=${emails.backingOff} abandoned_now=${emails.abandoned}`
        : 'failed'
    }; pending=${pending ?? '?'} abandoned=${abandoned ?? '?'}`
  )

  if (failures.length > 0) throw failures[0]
  return { reminders, emails, pending, abandoned }
}

/** Idempotent by scheduler id; re-run on every boot and Redis reconnect. Never throws. */
export async function registerNotificationSweep(): Promise<void> {
  try {
    await notificationQueue.upsertJobScheduler(
      NOTIFICATION_SWEEP_SCHEDULER_ID,
      { every: NOTIFICATION_SWEEP_INTERVAL_MS },
      {
        name: NOTIFICATION_SWEEP_JOB,
        data: {} as NotificationJobData,
        opts: { removeOnComplete: { count: 20 }, removeOnFail: { count: 50 } },
      }
    )
    console.log(
      `[notifications] sweep registered: job scheduler "${NOTIFICATION_SWEEP_SCHEDULER_ID}" every ${
        NOTIFICATION_SWEEP_INTERVAL_MS / 60_000
      } min`
    )
  } catch (error) {
    console.error('[notifications] failed to register the notification sweep:', error)
  }
}
