import { z } from 'zod'
import {
  createAppointmentServiceRole,
  findOrCreateClientServiceRole,
} from '@/lib/data/booking-service'
import { getAvailableSlots } from '@/lib/data/availability-engine'
import { getAgentByIdServiceRole } from '@/lib/data/agents-service'
import { sendAppointmentConfirmationEmail } from '@/lib/email/send-appointment-confirmation'
import { defineVoiceTool, type VoiceToolContext, type VoiceToolHandler } from './types'

/**
 * Voice booking has no service concept — this checks the exact requested
 * window against the engine's org-wide slot generation (no serviceId means a
 * 30-minute default duration internally, but the exact startsAt/endsAt match
 * below is what actually decides availability, not the generated duration).
 */
async function isSlotOpen(
  organizationId: string,
  startsAt: string,
  endsAt: string
): Promise<boolean> {
  const date = startsAt.slice(0, 10)
  const days = await getAvailableSlots(organizationId, {
    serviceId: '',
    rangeStart: date,
    rangeEnd: date,
  })
  const slotsForDay = days[0]?.slots ?? []
  return slotsForDay.some((slot) => slot.startsAt === startsAt && slot.endsAt === endsAt)
}

function buildCheckAvailability(context: VoiceToolContext): VoiceToolHandler {
  return defineVoiceTool({
    name: 'check_availability',
    description:
      'Check whether a requested appointment time is free. Pass the start and end as full ISO 8601 datetimes with a timezone offset (e.g. "2026-08-03T14:00:00+05:00" or "...Z"). Resolve relative requests like "tomorrow at 2pm" into absolute datetimes first. Returns available true, or available false with the title of the conflicting appointment so you can offer an alternative time.',
    parameters: z.object({
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
    }),
    execute: async (args) => {
      try {
        const available = await isSlotOpen(context.organizationId, args.startsAt, args.endsAt)
        if (available) {
          return { available: true }
        }
        return { available: false, conflictingTitle: null }
      } catch (error) {
        console.error('[booking-tools] check_availability failed:', error)
        return { error: 'availability_check_failed' }
      }
    },
  })
}

function buildBookAppointment(context: VoiceToolContext): VoiceToolHandler {
  return defineVoiceTool({
    name: 'book_appointment',
    description:
      "Book an appointment on the calendar for a caller, creating or reusing their client record. Requires the appointment title, the caller's full name, their email address, and the start/end as full ISO 8601 datetimes with a timezone offset (resolve relative dates first). The phone number and notes are optional. Before calling, confirm the exact date, time, and appointment details with the caller. The requested time must be free — if it is not, the booking is refused and you must offer an alternative time and retry.",
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
        const available = await isSlotOpen(context.organizationId, args.startsAt, args.endsAt)
        if (!available) {
          return { error: 'slot_unavailable', conflictingTitle: null }
        }

        const clientPhone = args.clientPhone?.trim() || null

        const client = await findOrCreateClientServiceRole(context.organizationId, {
          name: args.clientName,
          phoneNumber: clientPhone,
          email: args.clientEmail,
        })

        const appointment = await createAppointmentServiceRole(
          context.organizationId,
          context.agentId,
          context.conversationId,
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
          const agentDetail = await getAgentByIdServiceRole(context.agentId)
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
  })
}

/** Booking capabilities, in the order the model sees them. */
export function buildBookingToolHandlers(context: VoiceToolContext): VoiceToolHandler[] {
  return [buildCheckAvailability(context), buildBookAppointment(context)]
}
