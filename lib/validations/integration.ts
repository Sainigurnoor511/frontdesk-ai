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

export const configureGoogleCalendarSchema = z.object({
  calendarId: z.string().min(1, 'Calendar ID is required'),
})
export type ConfigureGoogleCalendarInput = z.infer<typeof configureGoogleCalendarSchema>

export const configureCalComSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  eventTypeId: z.coerce.number().int().positive('Event type ID must be a positive number'),
  timezone: z.string().min(1).default('UTC'),
})
export type ConfigureCalComInput = z.infer<typeof configureCalComSchema>

export const configureCalendlySchema = z.object({
  personalAccessToken: z.string().min(1, 'Personal access token is required'),
  eventTypeUri: z.string().url('Event type URI must be a valid URL'),
  ownerUri: z.string().url('Owner URI must be a valid URL'),
})
export type ConfigureCalendlyInput = z.infer<typeof configureCalendlySchema>

export const configureTwilioSchema = z.object({
  accountSid: z.string().min(1, 'Twilio Account SID is required'),
  authToken: z.string().min(1, 'Twilio Auth Token is required'),
  fromNumber: z.string().min(1, 'Default from number is required'),
  webCallsOnly: z.boolean().default(true),
})
export type ConfigureTwilioInput = z.infer<typeof configureTwilioSchema>

export const configurePlivoSchema = z.object({
  authId: z.string().min(1, 'Plivo Auth ID is required'),
  authToken: z.string().min(1, 'Plivo Auth Token is required'),
  fromNumber: z.string().min(1, 'Default from number is required'),
  webCallsOnly: z.boolean().default(true),
})
export type ConfigurePlivoInput = z.infer<typeof configurePlivoSchema>

export const configureSipTrunkSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  trunkDomain: z.string().min(1, 'SIP trunk domain is required'),
  username: z.string().min(1, 'SIP username is required'),
  password: z.string().min(1, 'SIP password is required'),
  webCallsOnly: z.boolean().default(true),
})
export type ConfigureSipTrunkInput = z.infer<typeof configureSipTrunkSchema>
