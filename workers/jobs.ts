import { config } from 'dotenv'
config({ path: '.env.local' })

import { Worker, type Job } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'
import { ASSEMBLYAI_SESSION_QUEUE } from '@/lib/queue/queues/assemblyai-session'
import {
  describeAssemblyAiSessionJob,
  processAssemblyAiSession,
} from '@/lib/queue/processors/assemblyai-session'
import {
  describeKnowledgeIndexingJob,
  processKnowledgeIndexing,
} from '@/lib/queue/processors/knowledge-indexing'
import {
  describeScanWebsiteJob,
  processScanWebsite,
} from '@/lib/queue/processors/scan-website'
import { describeWebhookJob, processWebhookDelivery } from '@/lib/queue/processors/webhook'

/**
 * Single host process for every BullMQ queue.
 *
 * Replaces four near-identical worker processes (scan-website, knowledge-indexing,
 * webhook, assemblyai-session). They differed only in queue name, handler, and
 * concurrency, so four Node runtimes were paying four times the baseline memory to
 * run the same boilerplate.
 *
 * The LiveKit voice agent is deliberately NOT here. `workers/voice-agent.ts`
 * bootstraps through `agents.cli.runApp` with `agent: import.meta.filename`, which
 * forks child processes that re-import that module. A `Worker` constructed at its
 * module scope would therefore be instantiated in the parent *and* in every forked
 * child, producing competing consumers that get orphaned when a call's job process
 * tears down. It also owns argv and the signal handlers. It stays its own process.
 *
 * Concurrency is per queue, carried over unchanged from the processes this
 * replaces. The two set to 1 matter: website crawling and embedding are the heavy,
 * CPU-bound jobs, and letting them run many-at-once in a shared process would
 * stall webhook delivery and transcript retrieval behind them.
 */
type QueueDefinition = {
  name: string
  concurrency: number
  // The job type varies per queue; each processor re-narrows its own `job.data`.
  process: (job: Job<never>) => Promise<void>
  describe: (job: Job<never>) => string
}

const QUEUES: QueueDefinition[] = [
  {
    name: 'scan-website',
    concurrency: 1,
    process: processScanWebsite as QueueDefinition['process'],
    describe: describeScanWebsiteJob as QueueDefinition['describe'],
  },
  {
    name: 'knowledge-indexing',
    concurrency: 1,
    process: processKnowledgeIndexing as QueueDefinition['process'],
    describe: describeKnowledgeIndexingJob as QueueDefinition['describe'],
  },
  {
    name: 'webhook-deliver',
    concurrency: 5,
    process: processWebhookDelivery as QueueDefinition['process'],
    describe: describeWebhookJob as QueueDefinition['describe'],
  },
  {
    name: ASSEMBLYAI_SESSION_QUEUE,
    concurrency: 5,
    process: processAssemblyAiSession as QueueDefinition['process'],
    describe: describeAssemblyAiSessionJob as QueueDefinition['describe'],
  },
]

/**
 * Optional comma-separated allowlist of queue names. Unset means "run everything",
 * which is the normal deployment.
 *
 * This exists so a queue can be peeled back out onto its own container purely by
 * configuration if it ever needs independent scaling or isolation — for example
 * running knowledge-indexing on a bigger box because it loads the embedding model.
 */
function selectedQueues(): QueueDefinition[] {
  const filter = process.env.WORKER_QUEUES?.trim()
  if (!filter) return QUEUES

  const wanted = new Set(
    filter
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  )

  const unknown = [...wanted].filter((name) => !QUEUES.some((queue) => queue.name === name))
  if (unknown.length > 0) {
    // Fail loudly: a typo here would silently run no workers at all, and the jobs
    // would pile up in Redis with nothing reporting an error.
    throw new Error(
      `WORKER_QUEUES names unknown queue(s): ${unknown.join(', ')}. Known: ${QUEUES.map((q) => q.name).join(', ')}`
    )
  }

  return QUEUES.filter((queue) => wanted.has(queue.name))
}

const active = selectedQueues()

const workers = active.map((definition) => {
  const worker = new Worker<never>(definition.name, definition.process, {
    connection: redisConnection,
    concurrency: definition.concurrency,
  })

  worker.on('completed', (job) => {
    console.log(`[${definition.name}] job ${job.id} completed (${definition.describe(job)})`)
  })

  worker.on('failed', (job, err) => {
    const detail = job ? ` (${definition.describe(job)})` : ''
    console.error(`[${definition.name}] job ${job?.id} failed${detail}:`, err)
  })

  return worker
})

console.log(
  `Job worker started for ${workers.length} queue(s): ${active
    .map((q) => `${q.name}(x${q.concurrency})`)
    .join(', ')}`
)

/**
 * Closing each Worker lets in-flight jobs finish and returns anything unstarted to
 * the queue. Without this, a container restart would leave jobs stalled until
 * BullMQ's lock expiry reclaimed them.
 */
let shuttingDown = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`Received ${signal}, finishing in-flight jobs...`)
    void Promise.allSettled(workers.map((worker) => worker.close()))
      .then(() => redisConnection.quit())
      .catch(() => undefined)
      .finally(() => process.exit(0))
  })
}
