import type { Job } from 'bullmq'
import { getWebhookConfig, deliverWebhook } from '@/lib/integrations/webhook'
import type { WebhookDeliverJobData } from '@/lib/queue/queues/webhook'

/**
 * Delivers an outbound webhook to an organization's configured endpoint.
 *
 * Re-reads the config at delivery time rather than trusting what was enqueued, so
 * an org that disables the webhook (or unsubscribes from the event) between enqueue
 * and delivery doesn't get a stray call.
 */
export async function processWebhookDelivery(job: Job<WebhookDeliverJobData>): Promise<void> {
  const { organizationId, event, data } = job.data
  const webhook = await getWebhookConfig(organizationId)
  if (!webhook || !webhook.events.includes(event)) return
  await deliverWebhook(webhook, { organizationId, event, data })
}

export function describeWebhookJob(job: Job<WebhookDeliverJobData>): string {
  return `event=${job.data.event}`
}
