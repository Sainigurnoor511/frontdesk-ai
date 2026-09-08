import { config } from 'dotenv'
config({ path: '.env.local' })

import { Worker } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'
import {
  ASSEMBLYAI_SESSION_QUEUE,
  type AssemblyAiSessionFinalizeJobData,
} from '@/lib/queue/queues/assemblyai-session'
import { finalizeAssemblyAiSession } from '@/lib/voice/providers/assemblyai/finalize-session'

const worker = new Worker<AssemblyAiSessionFinalizeJobData>(
  ASSEMBLYAI_SESSION_QUEUE,
  async (job) => {
    const { conversationId, sessionId } = job.data
    await finalizeAssemblyAiSession({ conversationId, sessionId })
  },
  { connection: redisConnection, concurrency: 5 }
)

worker.on('completed', (job) => {
  console.log(
    `AssemblyAI session job ${job.id} completed (conversation=${job.data.conversationId})`
  )
})

worker.on('failed', (job, err) => {
  // A `AssemblyAiSessionNotReadyError` here is expected on early attempts: the
  // job polls until AssemblyAI marks the session completed and its artifacts
  // appear. Only a final failure after all attempts means a lost transcript.
  console.error(
    `AssemblyAI session job ${job?.id} (conversation=${job?.data.conversationId}) failed:`,
    err
  )
})

console.log('AssemblyAI session worker started, listening for jobs...')
