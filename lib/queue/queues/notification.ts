import { lazyQueue } from '@/lib/queue/lazy-queue'
import type { NotificationType } from '@/lib/notifications/types'

export const NOTIFICATION_QUEUE = 'notification-deliver'

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
  const jobId = notificationJobId(data.type, data.subjectId)

  await removeNotificationJob(data.type, data.subjectId)
  await notificationQueue.add(data.type, data, { jobId, ...options })
}

/**
 * Drops a pending notification job. Used when the event it would announce can no
 * longer happen — a cancelled appointment must not keep a pending reminder.
 */
export async function removeNotificationJob(
  type: NotificationType,
  subjectId: string
): Promise<void> {
  const jobId = notificationJobId(type, subjectId)
  try {
    await notificationQueue.remove(jobId)
  } catch (error) {
    console.warn(`[notifications] could not remove job ${jobId}:`, error)
  }
}
