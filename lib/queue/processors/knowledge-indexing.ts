import type { Job } from 'bullmq'
import type { KnowledgeIndexingJobData } from '@/lib/queue/queues/knowledge-indexing'
import {
  indexKnowledgeSourceServiceRole,
  indexFaqServiceRole,
  deleteKnowledgeChunksForSourceServiceRole,
} from '@/lib/data/knowledge-service'

/**
 * Chunks and embeds knowledge sources and FAQs, and clears their chunks on delete.
 *
 * This is the only processor that loads the embedding model (`fastembed`), which
 * is why it keeps a concurrency of 1 — embedding is CPU-bound and would otherwise
 * starve the event loop for the other queues sharing this process.
 */
export async function processKnowledgeIndexing(
  job: Job<KnowledgeIndexingJobData>
): Promise<void> {
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
      throw new Error('Unknown knowledge indexing action')
  }
}

export function describeKnowledgeIndexingJob(job: Job<KnowledgeIndexingJobData>): string {
  const id = 'sourceId' in job.data ? `sourceId=${job.data.sourceId}` : `faqId=${job.data.faqId}`
  return `action=${job.data.action}, ${id}`
}
