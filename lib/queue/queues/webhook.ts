import { Queue } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'
import type { WebhookEventType } from '@/lib/integrations/webhook-events'

export type WebhookDeliverJobData = {
  organizationId: string
  event: WebhookEventType
  data: unknown
}

export const webhookQueue = new Queue<WebhookDeliverJobData>('webhook-deliver', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})
