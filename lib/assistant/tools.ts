import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

import { createAgent } from '@/app/onboarding/actions'
import {
  updateBusinessHours,
  createException,
  deleteException,
} from '@/app/(dashboard)/availability/actions'
import {
  updateBookingPageEnabled,
  toggleServiceOnBookingPage,
} from '@/app/(dashboard)/booking-page/actions'
import {
  updateBusinessProfile,
  updateSchedulingSettings,
  createLocation,
  createService,
  updateService,
  deleteService,
  createAsset,
  updateAsset,
  deleteAsset,
  createProduct,
  updateProduct,
  deleteProduct,
} from '@/app/(dashboard)/business/actions'
import {
  createAppointment,
  cancelAppointment,
  createTimeOff,
  deleteTimeOff,
} from '@/app/(dashboard)/calendar/actions'
import { createClient, updateClient, deleteClient } from '@/app/(dashboard)/clients/actions'
import {
  markMessageAsRead,
  markAllMessagesAsRead,
  deleteMessage,
  createContactFromMessage,
} from '@/app/(dashboard)/conversations/actions'
import { enableIntegration, disableIntegration } from '@/app/(dashboard)/integrations/actions'
import {
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
} from '@/app/(dashboard)/staff/actions'
import {
  updateNotificationSettings,
  updateFeatureSettings,
} from '@/app/(settings)/settings/actions'
import { submitFeedback } from '@/components/layout/feedback-actions'

import { createAgentSchema } from '@/lib/validations/agent'
import { businessHoursSchema, createExceptionSchema } from '@/lib/validations/availability'
import {
  updateBusinessProfileSchema,
  updateSchedulingSettingsSchema,
  createLocationSchema,
  createServiceSchema,
  updateServiceSchema,
  createAssetSchema,
  updateAssetSchema,
  createProductSchema,
  updateProductSchema,
} from '@/lib/validations/business'
import { createAppointmentSchema, createTimeOffSchema } from '@/lib/validations/calendar'
import { createClientSchema, updateClientSchema } from '@/lib/validations/client'
import {
  messageIdSchema,
  createContactFromMessageSchema,
} from '@/lib/validations/conversation'
import { submitFeedbackSchema } from '@/lib/validations/feedback'
import { enableIntegrationSchema } from '@/lib/validations/integration'
import {
  updateNotificationSettingsSchema,
  updateFeatureSettingsSchema,
  updateBookingPageSettingsSchema,
} from '@/lib/validations/settings'
import { createStaffSchema, updateStaffSchema } from '@/lib/validations/staff'

export type ToolDef = {
  name: string
  description: string
  schema: z.ZodTypeAny
  handler: (input: never) => Promise<unknown>
}

/**
 * Helper that keeps `schema` and `handler` inferentially linked, so each
 * handler receives the parsed output of its own Zod schema.
 */
function tool<S extends z.ZodTypeAny>(def: {
  name: string
  description: string
  schema: S
  handler: (input: z.infer<S>) => Promise<unknown>
}): ToolDef {
  return def as unknown as ToolDef
}

/** Wrapper schema for actions that take a single bare string id argument. */
const idSchema = z.object({ id: z.string().uuid() })

/**
 * `createAgent` calls `redirect()` on the success path, which throws a
 * `NEXT_REDIRECT` control-flow error instead of returning. Catch it here, treat
 * it as success, and pull the new agent id out of the redirect destination.
 * The destination lives in the middle of the digest:
 * `NEXT_REDIRECT;<type>;<destination>;<statusCode>;`
 */
function redirectDestination(error: unknown): string | null {
  if (!isRedirectError(error)) return null
  const parts = error.digest.split(';')
  return parts.slice(2, -2).join(';') || null
}

async function createAgentTool(input: z.infer<typeof createAgentSchema>) {
  try {
    return await createAgent(input)
  } catch (error) {
    const destination = redirectDestination(error)
    if (destination === null) throw error

    const agentId = destination.split('/').pop() ?? null
    return {
      success: true,
      agentId,
      message: `Receptionist created — view it at ${destination}`,
    }
  }
}

export const assistantTools: ToolDef[] = [
  // --- Receptionist agents -------------------------------------------------
  tool({
    name: 'create_receptionist_agent',
    description:
      'Create a new AI receptionist agent for the organization. Requires the business name, country, language, industry, how calls are answered (staff_first rings the staff phone first, agent_first answers with the AI immediately), the staff phone number in E.164 format, and how many seconds to ring before the AI takes over. Returns the id of the new receptionist.',
    schema: createAgentSchema,
    handler: createAgentTool,
  }),

  // --- Availability --------------------------------------------------------
  tool({
    name: 'update_business_hours',
    description:
      'Replace the weekly opening hours for the business. Requires all 7 days at once (dayOfWeek 0 = Sunday through 6 = Saturday); pass isOpen false for closed days and 24-hour HH:MM startTime/endTime for open days. Read the current hours back to the user before changing them if they only mentioned some days.',
    schema: businessHoursSchema,
    handler: updateBusinessHours,
  }),
  tool({
    name: 'create_availability_exception',
    description:
      'Add a one-off exception to the normal weekly hours, such as a public holiday closure or a day with unusual opening times. Use type "closed" for a full closure or "custom_hours" together with startTime/endTime. Dates are YYYY-MM-DD.',
    schema: createExceptionSchema,
    handler: createException,
  }),
  tool({
    name: 'delete_availability_exception',
    description:
      'Delete an availability exception (holiday or custom-hours override) by its id. Destructive — confirm with the user first unless they clearly named the exception to remove.',
    schema: idSchema,
    handler: ({ id }: z.infer<typeof idSchema>) => deleteException(id),
  }),

  // --- Booking page --------------------------------------------------------
  tool({
    name: 'update_booking_page_enabled',
    description:
      'Turn the public self-serve booking page on or off for the organization.',
    schema: updateBookingPageSettingsSchema,
    handler: updateBookingPageEnabled,
  }),
  tool({
    name: 'toggle_service_on_booking_page',
    description:
      'Show or hide a single service on the public booking page, by service id.',
    schema: z.object({
      serviceId: z.string().uuid(),
      showOnBookingPage: z.boolean(),
    }),
    handler: ({ serviceId, showOnBookingPage }: { serviceId: string; showOnBookingPage: boolean }) =>
      toggleServiceOnBookingPage(serviceId, showOnBookingPage),
  }),

  // --- Business profile ----------------------------------------------------
  tool({
    name: 'update_business_profile',
    description:
      'Update the core business profile: display name, two-letter country code, IANA timezone (e.g. "America/New_York") and currency code (e.g. "USD"). Timezone and currency are always required, so include the existing values if the user only wants to change one field.',
    schema: updateBusinessProfileSchema,
    handler: updateBusinessProfile,
  }),
  tool({
    name: 'update_scheduling_settings',
    description:
      'Update how appointments can be booked: the slot interval in minutes, how many days ahead clients may book, the minimum notice in minutes before a booking, and whether overlapping appointments are limited. All four fields are required together.',
    schema: updateSchedulingSettingsSchema,
    handler: updateSchedulingSettings,
  }),
  tool({
    name: 'create_business_location',
    description:
      'Add a physical location (branch, clinic, salon, office) to the business, with an optional street address.',
    schema: createLocationSchema,
    handler: createLocation,
  }),
  tool({
    name: 'create_service',
    description:
      'Create a bookable service with a name, duration in minutes, price, and a service type: "appointment" (standard in-person slot), "home_mobile" (travelling to the client), "group_session" (many clients at once), or "rental".',
    schema: createServiceSchema,
    handler: createService,
  }),
  tool({
    name: 'update_service',
    description:
      'Update an existing service by id. All service fields (name, duration, price, type) are required, so carry over the current values for anything the user is not changing.',
    schema: updateServiceSchema,
    handler: updateService,
  }),
  tool({
    name: 'delete_service',
    description:
      'Permanently delete a service by id. Destructive — confirm with the user before calling unless they explicitly asked for this exact service to be deleted.',
    schema: idSchema,
    handler: ({ id }: z.infer<typeof idSchema>) => deleteService(id),
  }),
  tool({
    name: 'create_asset',
    description:
      'Create a bookable asset — a room, chair, machine, vehicle or other resource that appointments can be assigned to.',
    schema: createAssetSchema,
    handler: createAsset,
  }),
  tool({
    name: 'update_asset',
    description:
      'Update a bookable asset by id, including renaming it or marking it active/inactive. All fields are required, so carry over current values for anything unchanged.',
    schema: updateAssetSchema,
    handler: updateAsset,
  }),
  tool({
    name: 'delete_asset',
    description:
      'Permanently delete a bookable asset by id. Destructive — confirm with the user first.',
    schema: idSchema,
    handler: ({ id }: z.infer<typeof idSchema>) => deleteAsset(id),
  }),
  tool({
    name: 'create_product',
    description:
      'Create a product the business sells (a retail item rather than a bookable service), with a name and price.',
    schema: createProductSchema,
    handler: createProduct,
  }),
  tool({
    name: 'update_product',
    description:
      'Update a product by id. All fields are required, so carry over current values for anything unchanged.',
    schema: updateProductSchema,
    handler: updateProduct,
  }),
  tool({
    name: 'delete_product',
    description: 'Permanently delete a product by id. Destructive — confirm with the user first.',
    schema: idSchema,
    handler: ({ id }: z.infer<typeof idSchema>) => deleteProduct(id),
  }),

  // --- Calendar ------------------------------------------------------------
  tool({
    name: 'create_appointment',
    description:
      'Book an appointment on the calendar for a named client. startsAt and endsAt must be full ISO 8601 datetimes with a timezone offset (e.g. "2026-03-04T14:00:00Z"). Resolve relative dates like "tomorrow at 2pm" into an absolute datetime before calling.',
    schema: createAppointmentSchema,
    handler: createAppointment,
  }),
  tool({
    name: 'cancel_appointment',
    description:
      'Cancel a booked appointment by id, marking it cancelled without deleting it. Confirm with the user before cancelling.',
    schema: idSchema,
    handler: ({ id }: z.infer<typeof idSchema>) => cancelAppointment(id),
  }),
  tool({
    name: 'create_time_off',
    description:
      'Block out time on the calendar so no bookings can be taken. Scope is "company" (everyone), "staff" (one person) or "asset" (one resource). startsAt/endsAt are ISO 8601 datetimes.',
    schema: createTimeOffSchema,
    handler: createTimeOff,
  }),
  tool({
    name: 'delete_time_off',
    description:
      'Delete a time-off block by id, freeing that period up for bookings again. Destructive — confirm with the user first.',
    schema: idSchema,
    handler: ({ id }: z.infer<typeof idSchema>) => deleteTimeOff(id),
  }),

  // --- Clients -------------------------------------------------------------
  tool({
    name: 'create_client',
    description:
      'Add a client (customer contact) with a name and phone number in E.164 format, plus optional email and free-text notes.',
    schema: createClientSchema,
    handler: createClient,
  }),
  tool({
    name: 'update_client',
    description:
      'Update a client record by id. Name and phone number are required, so carry over the existing values for anything the user is not changing.',
    schema: updateClientSchema,
    handler: updateClient,
  }),
  tool({
    name: 'delete_client',
    description:
      'Permanently delete a client record by id. Destructive — always confirm with the user before calling.',
    schema: idSchema,
    handler: ({ id }: z.infer<typeof idSchema>) => deleteClient(id),
  }),

  // --- Conversations / caller messages -------------------------------------
  tool({
    name: 'mark_message_as_read',
    description: 'Mark a single caller message as read, by message id.',
    schema: messageIdSchema,
    handler: ({ id }: z.infer<typeof messageIdSchema>) => markMessageAsRead(id),
  }),
  tool({
    name: 'mark_all_messages_as_read',
    description: 'Mark every unread caller message in the inbox as read. Takes no arguments.',
    schema: z.object({}),
    handler: () => markAllMessagesAsRead(),
  }),
  tool({
    name: 'delete_message',
    description:
      'Permanently delete a caller message by id. Destructive — confirm with the user first.',
    schema: messageIdSchema,
    handler: ({ id }: z.infer<typeof messageIdSchema>) => deleteMessage(id),
  }),
  tool({
    name: 'create_contact_from_message',
    description:
      'Turn a caller message into a saved client contact, using the caller name and phone number captured on the message. Fails if the message has no name or phone number.',
    schema: createContactFromMessageSchema,
    handler: ({ messageId }: z.infer<typeof createContactFromMessageSchema>) =>
      createContactFromMessage(messageId),
  }),

  // --- Integrations --------------------------------------------------------
  tool({
    name: 'enable_integration',
    description:
      'Enable a third-party integration for the organization by its slug (for example "google-calendar").',
    schema: enableIntegrationSchema,
    handler: ({ integrationSlug }: z.infer<typeof enableIntegrationSchema>) =>
      enableIntegration(integrationSlug),
  }),
  tool({
    name: 'disable_integration',
    description: 'Disable a previously enabled third-party integration by its slug.',
    schema: enableIntegrationSchema,
    handler: ({ integrationSlug }: z.infer<typeof enableIntegrationSchema>) =>
      disableIntegration(integrationSlug),
  }),

  // --- Staff ---------------------------------------------------------------
  tool({
    name: 'create_staff_member',
    description:
      'Add a staff member with a full name, plus optional display name, description, email, phone, whether they are active, and whether they appear on the public booking page.',
    schema: createStaffSchema,
    handler: createStaffMember,
  }),
  tool({
    name: 'update_staff_member',
    description:
      'Update a staff member by id. Full name is required, so carry over the existing value if the user is only changing other fields.',
    schema: updateStaffSchema,
    handler: updateStaffMember,
  }),
  tool({
    name: 'delete_staff_member',
    description:
      'Permanently delete a staff member by id. Destructive — always confirm with the user before calling.',
    schema: idSchema,
    handler: ({ id }: z.infer<typeof idSchema>) => deleteStaffMember(id),
  }),

  // --- Settings ------------------------------------------------------------
  tool({
    name: 'update_notification_settings',
    description:
      'Turn organization notifications on or off: post-call summaries, appointment reminders, client booking alerts and staff booking alerts. Every field is optional — send only the ones the user wants changed.',
    schema: updateNotificationSettingsSchema,
    handler: updateNotificationSettings,
  }),
  tool({
    name: 'update_feature_settings',
    description:
      'Enable or disable product features for the organization, which controls what appears in the sidebar and dashboard (services, staff, assets, products, availability, custom timezones, booking page, messages, FAQ, appointments, home/mobile visits, group sessions, rentals, guides). Every field is optional — send only the ones being changed.',
    schema: updateFeatureSettingsSchema,
    handler: updateFeatureSettings,
  }),

  // --- Feedback ------------------------------------------------------------
  tool({
    name: 'submit_feedback',
    description:
      'Send product feedback to the FrontDesk.ai team on the user\'s behalf: a 1-5 star rating, a description of an issue, and/or a feature request. At least one of the three must be provided.',
    schema: submitFeedbackSchema,
    handler: submitFeedback,
  }),
]

export const toolsByName = new Map(assistantTools.map((t) => [t.name, t]))

type JsonSchemaObject = Record<string, unknown>

type CompiledSchema = {
  /** JSON Schema handed to Groq — always an object schema. */
  parameters: JsonSchemaObject
  /**
   * True when the Zod schema is not itself an object schema (e.g. the weekly
   * `businessHoursSchema` array) and had to be wrapped in `{ value: ... }`.
   */
  wrapped: boolean
}

const compiledCache = new WeakMap<z.ZodTypeAny, CompiledSchema>()

/**
 * Groq's chat completions API is OpenAI-compatible, so each tool is described
 * as `{ type: 'function', function: { name, description, parameters } }` where
 * `parameters` is a JSON Schema object derived from the action's Zod schema.
 *
 * The generated JSON Schema's `type` is the source of truth for whether a
 * wrapper is needed — `instanceof z.ZodObject` is not reliable across Zod
 * builds, and would misclassify plain object schemas.
 */
export function compileSchema(schema: z.ZodTypeAny): CompiledSchema {
  const cached = compiledCache.get(schema)
  if (cached) return cached

  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' }) as JsonSchemaObject
  delete jsonSchema.$schema

  const compiled: CompiledSchema =
    jsonSchema.type === 'object'
      ? { parameters: jsonSchema, wrapped: false }
      : {
          parameters: {
            type: 'object',
            properties: { value: jsonSchema },
            required: ['value'],
          },
          wrapped: true,
        }

  compiledCache.set(schema, compiled)
  return compiled
}

export function toolParameterSchema(schema: z.ZodTypeAny): JsonSchemaObject {
  return compileSchema(schema).parameters
}

/** True when the tool's real schema is not an object and had to be wrapped. */
export function isWrappedSchema(schema: z.ZodTypeAny): boolean {
  return compileSchema(schema).wrapped
}

export function buildGroqTools() {
  return assistantTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: toolParameterSchema(t.schema),
    },
  }))
}

/**
 * Validate the arguments the model produced against the tool's own Zod schema
 * (never trust raw model JSON), then run the underlying server action.
 */
export async function executeTool(
  name: string,
  rawArgs: unknown
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const toolDef = toolsByName.get(name)
  if (!toolDef) {
    return { ok: false, error: `Unknown tool "${name}".` }
  }

  // Unwrap the `{ value: ... }` envelope used for non-object schemas.
  const args =
    isWrappedSchema(toolDef.schema) &&
    typeof rawArgs === 'object' &&
    rawArgs !== null &&
    'value' in rawArgs
      ? (rawArgs as { value: unknown }).value
      : rawArgs

  const parsed = toolDef.schema.safeParse(args)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid arguments for "${name}": ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; ')}`,
    }
  }

  try {
    const result = await toolDef.handler(parsed.data as never)
    return { ok: true, result }
  } catch (error) {
    if (isRedirectError(error)) throw error
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The action failed unexpectedly.',
    }
  }
}
