import { z } from 'zod'

export const getPublicAvailableSlotsSchema = z.object({
  organizationId: z.string().uuid(),
  serviceId: z.string().uuid(),
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
