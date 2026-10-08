import type { Job } from 'bullmq'
import { crawlWebsite } from '@/lib/crawler/crawl'
import { createGroqProvider } from '@/lib/providers/llm/groq'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { ScanWebsiteJobData } from '@/lib/queue/queues/scan-website'

/**
 * Crawls a prospect's website and extracts business details to seed onboarding.
 *
 * Records failure on the `agent_scan_jobs` row rather than rethrowing: the
 * onboarding UI polls that row, so a thrown error would leave the user watching a
 * spinner forever while BullMQ retried silently.
 */
export async function processScanWebsite(job: Job<ScanWebsiteJobData>): Promise<void> {
  const { scanJobId, url, scanDepth } = job.data
  const serviceClient = createServiceRoleClient()

  await serviceClient.from('agent_scan_jobs').update({ status: 'running' }).eq('id', scanJobId)

  try {
    const pageText = await crawlWebsite(url, scanDepth)
    const provider = createGroqProvider()
    const extracted = await provider.extractBusinessInfo(pageText)

    await serviceClient
      .from('agent_scan_jobs')
      .update({
        status: 'completed',
        extracted_data: extracted,
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanJobId)
  } catch (err) {
    await serviceClient
      .from('agent_scan_jobs')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanJobId)
  }
}

export function describeScanWebsiteJob(job: Job<ScanWebsiteJobData>): string {
  return `scanJobId=${job.data.scanJobId}, url=${job.data.url}`
}
