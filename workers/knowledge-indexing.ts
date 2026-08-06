import { config } from 'dotenv'
config({ path: '.env.local' })

import { Worker } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'
import type { KnowledgeIndexingJobData } from '@/lib/queue/queues/knowledge-indexing'
import {
  indexKnowledgeSourceServiceRole,
  indexFaqServiceRole,
  deleteKnowledgeChunksForSourceServiceRole,
} from '@/lib/data/knowledge-service'

const worker = new Worker<KnowledgeIndexingJobData>(
  'knowledge-indexing',
  async (job) => {
    switch (job.data.action) {
      case 'index_source':
        await indexKnowledgeSourceServiceRole(job.data.sourceId)
        break
      case 'index_faq':
        await indexFaqServiceRole(job.data.faqId)
        break
      case 'delete_source':
        await deleteKnowledgeChunksForSourceServiceRole(
          job.data.organizationId,
          'knowledge_source',
          job.data.sourceId
        )
        break
      case 'delete_faq':
        await deleteKnowledgeChunksForSourceServiceRole(
          job.data.organizationId,
          'faq',
          job.data.faqId
        )
        break
      default:
        throw new Error(`Unknown knowledge indexing action`)
    }
  },
  { connection: redisConnection }
)

worker.on('failed', (job, err) => {
  console.error(`Knowledge indexing job ${job?.id} failed:`, err)
})

console.log('Knowledge indexing worker started, listening for jobs...')
