import { Queue } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'

export type KnowledgeIndexingJobData =
  | { action: 'index_source'; sourceId: string }
  | { action: 'index_faq'; faqId: string }
  | { action: 'delete_source'; organizationId: string; sourceId: string }
  | { action: 'delete_faq'; organizationId: string; faqId: string }

export const knowledgeIndexingQueue = new Queue<KnowledgeIndexingJobData>(
  'knowledge-indexing',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  }
)
