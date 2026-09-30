import { Queue } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'

export type AssemblyAiSessionFinalizeJobData = {
  conversationId: string
  sessionId: string
}

export const ASSEMBLYAI_SESSION_QUEUE = 'assemblyai-session-finalize'

/**
 * Pulls the transcript and recording for a finished AssemblyAI voice session and
 * writes them onto the conversation.
 *
 * Enqueued from two places, and idempotent so both firing is harmless:
 *
 *  1. the browser's hangup handler, with a short delay to let AssemblyAI finish
 *     assembling the session artifacts, and
 *  2. the `session.completed` webhook, when one is registered.
 *
 * Because path 1 exists, the webhook is a latency optimization rather than a
 * requirement — which matters a lot in local development, where a public tunnel
 * would otherwise be mandatory just to get transcripts.
 *
 * Generous retries with a long backoff: artifacts only appear once the session
 * reaches `completed`, and the job intentionally throws to retry while it's still
 * settling.
 */
export const assemblyAiSessionQueue = new Queue<AssemblyAiSessionFinalizeJobData>(
  ASSEMBLYAI_SESSION_QUEUE,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 8,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
)

/**
 * A stable job id per conversation makes enqueueing idempotent: the hangup path
 * and the webhook path collapse into one job instead of racing to write the same
 * transcript twice.
 */
export function assemblyAiSessionJobId(conversationId: string): string {
  return `assemblyai-session-${conversationId}`
}
