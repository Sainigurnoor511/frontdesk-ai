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
}

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
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: { age: 86_400 },
  },
})

export function notificationJobId(type: NotificationType, subjectId: string): string {
  return `notify:${type}:${subjectId}`
}
