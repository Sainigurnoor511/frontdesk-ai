import { z } from 'zod'
import { WEBHOOK_EVENT_TYPES } from '@/lib/integrations/webhook-events'

export const enableIntegrationSchema = z.object({
  integrationSlug: z.string().min(1, 'Integration is required'),
})
export type EnableIntegrationInput = z.infer<typeof enableIntegrationSchema>

export const configureWebhookSchema = z.object({
  url: z.string().url('Enter a valid webhook URL').max(2000),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, 'Select at least one event'),
  secret: z.string().max(256).optional(),
})
export type ConfigureWebhookInput = z.infer<typeof configureWebhookSchema>
