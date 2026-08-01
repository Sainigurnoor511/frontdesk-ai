import { z } from 'zod'

const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time (HH:MM)')

export const businessHoursDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isOpen: z.boolean(),
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.optional(),
})
export type BusinessHoursDayInput = z.infer<typeof businessHoursDaySchema>

export const businessHoursSchema = z.array(businessHoursDaySchema).length(7)
export type BusinessHoursInput = z.infer<typeof businessHoursSchema>

export const createExceptionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  type: z.enum(['closed', 'custom_hours']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.optional(),
  reason: z.string().max(500).optional(),
})
export type CreateExceptionInput = z.infer<typeof createExceptionSchema>
