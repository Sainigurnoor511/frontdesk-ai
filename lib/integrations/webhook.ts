// Service-role-safe webhook dispatch, importable from both server actions and
// standalone worker processes (no `next/headers`, no `server-only`-tainted
// imports). Booking paths enqueue a delivery job only when the org has the
// webhook tool enabled and subscribed to the event; the worker re-reads the
// config at delivery time so disabling the integration mid-flight is honored.
import { createHmac } from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { webhookQueue } from '@/lib/queue/queues/webhook'
import { configureWebhookSchema } from '@/lib/validations/integration'
import { WEBHOOK_SLUG, type WebhookEventType } from './webhook-events'

export type WebhookConfig = {
  url: string
  events: WebhookEventType[]
  secret?: string
}

/**
 * Read the org's stored webhook config. Returns null when the integration is
 * disabled, not configured, or its stored config fails validation.
 */
export async function getWebhookConfig(organizationId: string): Promise<WebhookConfig | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organization_integrations')
    .select('is_enabled, config')
    .eq('organization_id', organizationId)
    .eq('integration_slug', WEBHOOK_SLUG)
    .maybeSingle()

  if (!data || !data.is_enabled) return null
  const parsed = configureWebhookSchema.safeParse(data.config)
  if (!parsed.success) return null
  return parsed.data
}

/**
 * Fire-and-forget: enqueue a delivery job only when the org is configured for
 * this event. Never throws into the caller — booking must not fail because a
 * webhook couldn't be enqueued.
 */
export async function dispatchWebhook(
  organizationId: string,
  event: WebhookEventType,
  data: unknown
): Promise<void> {
  try {
    const config = await getWebhookConfig(organizationId)
    if (!config || !config.events.includes(event)) return
    await webhookQueue.add('deliver', { organizationId, event, data })
  } catch (error) {
    console.error(`[webhook] failed to enqueue ${event} for org ${organizationId}:`, error)
  }
}

/**
 * POST the event envelope to the configured URL, signed with the org's secret
 * (if any) via an HMAC-SHA256 `X-Frontdesk-Signature` header. Throws on
 * non-2xx so the BullMQ job retries with backoff.
 */
export async function deliverWebhook(
  config: WebhookConfig,
  envelope: { organizationId: string; event: WebhookEventType; data: unknown }
): Promise<void> {
  const body = JSON.stringify({
    event: envelope.event,
    occurredAt: new Date().toISOString(),
    organizationId: envelope.organizationId,
    data: envelope.data,
  })
  const signature = config.secret
    ? `sha256=${createHmac('sha256', config.secret).update(body).digest('hex')}`
    : undefined

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'X-Frontdesk-Signature': signature } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Webhook delivery to ${config.url} failed with status ${response.status}`)
  }
}
