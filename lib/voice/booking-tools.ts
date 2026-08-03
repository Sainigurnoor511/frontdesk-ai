import { tool } from '@livekit/agents'
import { z } from 'zod'
import {
  checkAvailabilityServiceRole,
  createAppointmentServiceRole,
  findOrCreateClientServiceRole,
} from '@/lib/data/booking-service'
import { getAgentByIdServiceRole } from '@/lib/data/agents-service'
import { sendAppointmentConfirmationEmail } from '@/lib/email/send-appointment-confirmation'

/**
 * LiveKit voice-agent tool definitions for booking during a call. Uses
 * `@livekit/agents`' own `tool()` helper (Zod schemas accepted directly for
 * `parameters`) — NOT the local text-assistant wrapper in
 * `lib/assistant/tools.ts`, which targets the dashboard chat assistant's HTTP
 * tool-calling loop and has a different signature.
 *
 * The tools close over `organizationId`, `agentId`, and `conversationId` from
 * the room metadata (never LLM-supplied), so the model can't book into another
 * org or link appointments to a foreign conversation. `execute` functions never
 * throw into the LLM turn — every failure path returns a structured `{ error }`
 * the model can relay conversationally.
 */
export function buildBookingTools({
  organizationId,
  agentId,
  conversationId,
}: {
  organizationId: string
  agentId: string
  conversationId: string
}) {
  return {
    check_availability: tool({
      description:
        'Check whether a requested appointment time is free. Pass the start and end as full ISO 8601 datetimes with a timezone offset (e.g. "2026-08-03T14:00:00+05:00" or "...Z"). Resolve relative requests like "tomorrow at 2pm" into absolute datetimes first. Returns available true, or available false with the title of the conflicting appointment so you can offer an alternative time.',
      parameters: z.object({
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
      }),
      execute: async (args) => {
        try {
          const result = await checkAvailabilityServiceRole(
            organizationId,
            args.startsAt,
            args.endsAt
          )
          if (result.available) {
            return { available: true }
          }
          return { available: false, conflictingTitle: result.conflicts[0]?.title ?? null }
        } catch (error) {
          console.error('[booking-tools] check_availability failed:', error)
          return { error: 'availability_check_failed' }
        }
      },
    }),

    book_appointment: tool({
      description:
        'Book an appointment on the calendar for a caller, creating or reusing their client record. Requires the appointment title, the caller\'s full name, their email address, and the start/end as full ISO 8601 datetimes with a timezone offset (resolve relative dates first). The phone number and notes are optional. Before calling, confirm the exact date, time, and appointment details with the caller. The requested time must be free — if it is not, the booking is refused and you must offer an alternative time and retry.',
      parameters: z.object({
        title: z.string().min(1),
        clientName: z.string().min(1),
        clientEmail: z.string().email(),
        clientPhone: z.string().optional(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        notes: z.string().optional(),
      }),
      execute: async (args) => {
        try {
          const availability = await checkAvailabilityServiceRole(
            organizationId,
            args.startsAt,
            args.endsAt
          )
          if (!availability.available) {
            return {
              error: 'slot_unavailable',
              conflictingTitle: availability.conflicts[0]?.title ?? null,
            }
          }

          const clientPhone = args.clientPhone?.trim() || null

          const client = await findOrCreateClientServiceRole(organizationId, {
            name: args.clientName,
            phoneNumber: clientPhone,
            email: args.clientEmail,
          })

          const appointment = await createAppointmentServiceRole(
            organizationId,
            agentId,
            conversationId,
            {
              title: args.title,
              clientName: args.clientName,
              clientPhone,
              clientId: client.id,
              startsAt: args.startsAt,
              endsAt: args.endsAt,
              notes: args.notes,
            }
          )

          // Email failure is a lesser failure than an unbooked appointment — the
          // booking is already committed, so log and continue as success.
          try {
            const agentDetail = await getAgentByIdServiceRole(agentId)
            await sendAppointmentConfirmationEmail({
              to: args.clientEmail,
              clientName: args.clientName,
              businessName: agentDetail?.business_name ?? 'Our office',
              startsAt: args.startsAt,
              endsAt: args.endsAt,
            })
          } catch (emailError) {
            console.error(
              `[booking-tools] confirmation email failed for appointment ${appointment.id}:`,
              emailError
            )
          }

          return { success: true, appointmentId: appointment.id, isNewClient: client.isNew }
        } catch (error) {
          console.error('[booking-tools] book_appointment failed:', error)
          return { error: 'booking_failed' }
        }
      },
    }),
  }
}
