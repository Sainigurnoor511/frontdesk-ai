import { lazyQueue } from '@/lib/queue/lazy-queue'
import type { WebhookEventType } from '@/lib/integrations/webhook-events'

export type WebhookDeliverJobData = {
  organizationId: string
  event: WebhookEventType
  data: unknown
}

export const webhookQueue = lazyQueue<WebhookDeliverJobData>('webhook-deliver', {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})
