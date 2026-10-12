import { z } from 'zod'

export const getPublicAvailableSlotsSchema = z.object({
  organizationId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type GetPublicAvailableSlotsInput = z.infer<typeof getPublicAvailableSlotsSchema>

export const createPublicAppointmentSchema = z.object({
  organizationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  clientName: z.string().min(1).max(200),
  clientEmail: z.string().email(),
  clientPhone: z.string().max(30).optional(),
  businessName: z.string().optional(),
  notes: z.string().max(4000).optional(),
  turnstileToken: z.string().optional(),
})
export type CreatePublicAppointmentInput = z.infer<typeof createPublicAppointmentSchema>

export const lookupPublicAppointmentsSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
})
export type LookupPublicAppointmentsInput = z.infer<typeof lookupPublicAppointmentsSchema>

export const reschedulePublicAppointmentSchema = z.object({
  organizationId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  email: z.string().email(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
})
export type ReschedulePublicAppointmentInput = z.infer<typeof reschedulePublicAppointmentSchema>

export const cancelPublicAppointmentSchema = z.object({
  organizationId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  email: z.string().email(),
})
export type CancelPublicAppointmentInput = z.infer<typeof cancelPublicAppointmentSchema>

// Argument schemas for the voice manage-booking tools
// (`lib/voice/tools/manage-booking-handlers.ts`).
//
// Deliberately absent from all three: any organization selector. The org comes
// from `VoiceToolContext`, never from the model.
//
// These use `.datetime({ offset: true })` rather than the bare `.datetime()`
// the older `check_availability` / `book_appointment` schemas use, because that
// bare form rejects `+05:00` even though those tools' descriptions ask for it.
// Aligning the two older schemas is a backlog item, not part of this change.

export const findVoiceAppointmentSchema = z.object({
  clientEmail: z.string().email().max(320),
})
export type FindVoiceAppointmentInput = z.infer<typeof findVoiceAppointmentSchema>

export const cancelVoiceAppointmentSchema = z.object({
  clientEmail: z.string().email().max(320),
  startsAt: z.string().datetime({ offset: true }),
  appointmentId: z.string().uuid().optional(),
})
export type CancelVoiceAppointmentInput = z.infer<typeof cancelVoiceAppointmentSchema>

// No `newEndsAt`: the appointment keeps its stored length, so an end before the
// start is unrepresentable rather than validated. Adding the field back would
// also force a `.refine()`, and `@livekit/agents`' `tool()` rejects anything
// that is not a bare `ZodObject` at construction time.
export const rescheduleVoiceAppointmentSchema = z.object({
  clientEmail: z.string().email().max(320),
  startsAt: z.string().datetime({ offset: true }),
  newStartsAt: z.string().datetime({ offset: true }),
  appointmentId: z.string().uuid().optional(),
})
export type RescheduleVoiceAppointmentInput = z.infer<typeof rescheduleVoiceAppointmentSchema>
