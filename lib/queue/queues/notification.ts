import { lazyQueue } from '@/lib/queue/lazy-queue'
import {
  appointmentReminderDedupeKey,
  type NotificationType,
} from '@/lib/notifications/types'

export const NOTIFICATION_QUEUE = 'notification-deliver'

// The sweep rides this queue (not its own) so it runs wherever deliveries run.
export const NOTIFICATION_SWEEP_JOB = 'notification-sweep'
export const NOTIFICATION_SWEEP_SCHEDULER_ID = 'notification-sweep'

// Past this many capped windows the row stays `pending` and the sweep owns it.
export const MAX_CAP_DEFERRALS = 3

/**
 * The post-call-summary job is enqueued from `updateConversationStatus` *before*
 * the conversation update commits (the only placement that survives LiveKit's
 * job-process teardown), so hold it briefly and let the processor re-read a
 * committed row. The processor's not-finalized guard is the backstop.
 */
export const POST_CALL_SUMMARY_DELAY_MS = 10_000

export type NotificationJobData = {
  organizationId: string
  /** All four types, including 'appointment_reminder'. */
  type: NotificationType
  /** Conversation id for post_call_summary, appointment id otherwise. */
  subjectId: string
  /** Set only on a delivery deferred past a `client_booking` cap window. */
  capDeferrals?: number
  /** Reminders only: the start this job was installed for, so a stale one is detectable. */
  startsAt?: string
  /** Set only on the sweep's Nth re-queue of an owed email. */
  sweepAttempt?: number
}

/**
 * Attempts for the post-call summary, which is the only type enqueued before
 * its subject row commits. The processor throws a recoverable error while
 * `status === 'active'`, so the attempt window *is* the budget the finalize path
 * gets: with the 10 s initial delay and exponential 10 s backoff, 5 attempts
 * spans ~2m 40s instead of the ~40 s three attempts gave it.
 */
export const POST_CALL_SUMMARY_ATTEMPTS = 5

export const notificationQueue = lazyQueue<NotificationJobData>(NOTIFICATION_QUEUE, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    // Job ids are fixed per (type, subject), so neither set self-trims: the
    // completed set would grow without bound, and a job stuck in the failed set
    // would shadow every later add() for that subject while `email_sent_at` is
    // back to null and the row still looks deliverable. Trimming is safe for the
    // same reason in both cases — the database claim (notifications_dedupe_idx
    // plus email_sent_at), not the job id, is what prevents a duplicate send.
    // Same rationale as assemblyai-session, the other fixed-jobId queue.
    //
    // `removeOnFail` is an hour rather than a day: `addNotificationJob()` clears
    // a shadowing job itself, and this bounds the window in which a path that
    // forgets to go through it can be shadowed at all.
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: { age: 3_600 },
  },
})

export function notificationJobId(type: NotificationType, subjectId: string): string {
  return `notify:${type}:${subjectId}`
}

/**
 * Job id for a delivery deferred to a later rate-limit window. Deliberately
 * *not* `notificationJobId()`: the deferral is enqueued from inside the job that
 * owns that id, which is still active and therefore cannot be removed.
 */
export function notificationDeferralJobId(
  type: NotificationType,
  subjectId: string,
  deferral: number
): string {
  return `${notificationJobId(type, subjectId)}:defer${deferral}`
}

/** Own id, like a deferral: the original is usually parked, making `add()` a no-op. */
export function notificationSweepJobId(
  type: NotificationType,
  subjectId: string,
  attempt: number
): string {
  return `${notificationJobId(type, subjectId)}:sweep${attempt}`
}

/** Every job id that may carry this subject's delivery: original, deferrals, latest re-queue. */
export function notificationDeliveryJobIds(
  type: NotificationType,
  subjectId: string,
  sweepAttempts: number
): string[] {
  const ids = [notificationJobId(type, subjectId)]
  for (let deferral = 1; deferral <= MAX_CAP_DEFERRALS; deferral += 1) {
    ids.push(notificationDeferralJobId(type, subjectId, deferral))
  }
  if (sweepAttempts > 0) ids.push(notificationSweepJobId(type, subjectId, sweepAttempts))
  return ids
}

const LIVE_STATES = new Set(['waiting', 'delayed', 'active', 'prioritized', 'waiting-children'])

/** True when any of these jobs is still going to run (or is running). */
export async function anyNotificationJobLive(jobIds: string[]): Promise<boolean> {
  for (const jobId of jobIds) {
    if (LIVE_STATES.has(await notificationQueue.getJobState(jobId))) return true
  }
  return false
}

/**
 * The one place a notification job is installed under its fixed job id.
 *
 * BullMQ treats `add()` with an existing job id as a no-op — and "existing"
 * includes delayed, failed and completed jobs. Every caller here is installing
 * the *current* truth (a moved appointment's new reminder time, a re-finalized
 * conversation), so a job already parked under that id is stale by definition
 * and is removed first. Without this, moving an appointment would silently keep
 * the reminder at its original time.
 *
 * Removal failures are logged, not thrown: `remove()` refuses a job that is
 * locked by a worker, which means that job is delivering the same notification
 * right now and the database claim already makes a duplicate send impossible.
 */
export async function addNotificationJob(
  data: NotificationJobData,
  options: { delay?: number; attempts?: number } = {}
): Promise<void> {
  // The id follows the payload: a cap deferral carries `capDeferrals`, and gets
  // its own `:deferN` id, so it is cleared and installed through exactly the
  // same remove-before-add as the original. A deferral that skipped this used to
  // be swallowed by a failed `:deferN` job still sitting in the failed set.
  const jobId = data.capDeferrals
    ? notificationDeferralJobId(data.type, data.subjectId, data.capDeferrals)
    : data.sweepAttempt
      ? notificationSweepJobId(data.type, data.subjectId, data.sweepAttempt)
      : notificationJobId(data.type, data.subjectId)

  await removeJob(jobId)
  await notificationQueue.add(data.type, data, { jobId, ...options })
}

export type ReminderJobOutcome = 'added' | 'kept' | 'replaced'

/** Add-if-absent by dedupe key: same start is never reset; another start or a failed job is replaced. */
export async function ensureAppointmentReminderJob(
  organizationId: string,
  appointmentId: string,
  startsAt: string,
  delay: number
): Promise<ReminderJobOutcome> {
  const jobId = notificationJobId('appointment_reminder', appointmentId)
  const existing = await notificationQueue.getJob(jobId)

  if (existing) {
    const state = await existing.getState()
    const wanted = appointmentReminderDedupeKey(appointmentId, startsAt)
    const installed = existing.data?.startsAt
      ? appointmentReminderDedupeKey(appointmentId, existing.data.startsAt)
      : null

    if (state === 'active') return 'kept'
    if (installed !== null && installed === wanted && state !== 'failed') return 'kept'

    await removeJob(jobId)
  }

  await notificationQueue.add(
    'appointment_reminder',
    { organizationId, type: 'appointment_reminder', subjectId: appointmentId, startsAt },
    { jobId, delay: Math.max(0, delay) }
  )
  return existing ? 'replaced' : 'added'
}

/**
 * Drops a pending notification job. Used when the event it would announce can no
 * longer happen — a cancelled appointment must not keep a pending reminder.
 */
export async function removeNotificationJob(
  type: NotificationType,
  subjectId: string
): Promise<void> {
  await removeJob(notificationJobId(type, subjectId))
}

async function removeJob(jobId: string): Promise<void> {
  try {
    await notificationQueue.remove(jobId)
  } catch (error) {
    console.warn(`[notifications] could not remove job ${jobId}:`, error)
  }
}
