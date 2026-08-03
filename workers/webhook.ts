import { config } from 'dotenv'
config({ path: '.env.local' })

import { Worker } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'
import { getWebhookConfig, deliverWebhook } from '@/lib/integrations/webhook'
import type { WebhookDeliverJobData } from '@/lib/queue/queues/webhook'

const worker = new Worker<WebhookDeliverJobData>(
  'webhook-deliver',
  async (job) => {
    const { organizationId, event, data } = job.data
    const webhook = await getWebhookConfig(organizationId)
    // The config may have changed (or the integration been disabled) after the
    // job was enqueued — skip silently rather than erroring and retrying.
    if (!webhook || !webhook.events.includes(event)) return
    await deliverWebhook(webhook, { organizationId, event, data })
  },
  { connection: redisConnection, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`Webhook deliver job ${job?.id} (${job?.data.event}) failed:`, err)
})

console.log('Webhook delivery worker started, listening for jobs...')
