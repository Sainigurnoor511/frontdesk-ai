import type { Job } from 'bullmq'
import type { AssemblyAiSessionFinalizeJobData } from '@/lib/queue/queues/assemblyai-session'
import { finalizeAssemblyAiSession } from '@/lib/voice/providers/assemblyai/finalize-session'

/**
 * Pulls the transcript and recording for a finished AssemblyAI call and writes
 * them onto the conversation.
 *
 * Expected to fail on early attempts: it throws `AssemblyAiSessionNotReadyError`
 * while AssemblyAI is still assembling the session artifacts, and relies on
 * BullMQ's backoff to poll. Only a failure after the final attempt means a lost
 * transcript.
 */
export async function processAssemblyAiSession(
  job: Job<AssemblyAiSessionFinalizeJobData>
): Promise<void> {
  const { conversationId, sessionId } = job.data
  await finalizeAssemblyAiSession({ conversationId, sessionId })
}

export function describeAssemblyAiSessionJob(
  job: Job<AssemblyAiSessionFinalizeJobData>
): string {
  return `conversation=${job.data.conversationId}`
}
