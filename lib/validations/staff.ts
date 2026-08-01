import { z } from 'zod'

export const createStaffSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  displayName: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
  showOnBookingPage: z.boolean().default(true),
})
export type CreateStaffInput = z.infer<typeof createStaffSchema>

export const updateStaffSchema = createStaffSchema.extend({
  id: z.string().uuid(),
})
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
