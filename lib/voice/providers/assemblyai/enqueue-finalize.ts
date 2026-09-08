import {
  assemblyAiSessionJobId,
  assemblyAiSessionQueue,
} from '@/lib/queue/queues/assemblyai-session'

/**
 * Gives AssemblyAI a moment to close the session and publish its artifacts before
 * the first fetch attempt. The job retries with backoff anyway, so this only
 * avoids a guaranteed-wasted first attempt.
 */
const FINALIZE_DELAY_MS = 10_000

/**
 * Queues transcript-and-recording retrieval for a finished session.
 *
 * Safe to call more than once for the same conversation: the fixed job id makes
 * BullMQ collapse duplicates, so the hangup path and the webhook path can both
 * fire without racing to write the same transcript.
 *
 * Never throws. A failure to enqueue must not break hangup or cause a webhook
 * retry storm; the conversation stays `active` and can be reconciled later.
 */
export async function enqueueAssemblyAiFinalize(options: {
  conversationId: string
  sessionId: string
  /** Webhook deliveries mean the session is already closed, so skip the delay. */
  immediate?: boolean
}): Promise<void> {
  try {
    await assemblyAiSessionQueue.add(
      'finalize',
      { conversationId: options.conversationId, sessionId: options.sessionId },
      {
        jobId: assemblyAiSessionJobId(options.conversationId),
        delay: options.immediate ? 0 : FINALIZE_DELAY_MS,
      }
    )
  } catch (err) {
    console.error(
      `[assemblyai] failed to enqueue finalize job for conversation ${options.conversationId}:`,
      err
    )
  }
}
