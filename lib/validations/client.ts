import { z } from 'zod'

export const createClientSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number'),
  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
})
export type CreateClientInput = z.infer<typeof createClientSchema>

export const updateClientSchema = createClientSchema.extend({
  id: z.string().uuid(),
})
export type UpdateClientInput = z.infer<typeof updateClientSchema>
