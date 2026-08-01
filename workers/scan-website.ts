import { config } from 'dotenv'
config({ path: '.env.local' })

import { Worker } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'
import { crawlWebsite } from '@/lib/crawler/crawl'
import { createGroqProvider } from '@/lib/providers/llm/groq'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { ScanWebsiteJobData } from '@/lib/queue/queues/scan-website'

const worker = new Worker<ScanWebsiteJobData>(
  'scan-website',
  async (job) => {
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
  },
  { connection: redisConnection }
)

worker.on('failed', (job, err) => {
  console.error(`Scan job ${job?.id} failed:`, err)
})

console.log('Scan website worker started, listening for jobs...')
