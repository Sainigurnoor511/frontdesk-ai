import { z } from 'zod'

export const createAppointmentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  clientName: z.string().min(1, 'Client name is required'),
  clientPhone: z
    .string()
    .regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
})
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>

export const updateAppointmentSchema = createAppointmentSchema
export type UpdateAppointmentInput = CreateAppointmentInput

export const createTimeOffSchema = z.object({
  scope: z.enum(['company', 'staff', 'asset']),
  name: z.string().min(1, 'Name is required'),
  allDay: z.boolean(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().optional(),
})
export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>
