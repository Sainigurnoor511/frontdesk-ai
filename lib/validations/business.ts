import { z } from 'zod'

export const updateBusinessProfileSchema = z.object({
  businessName: z.string().max(200).optional(),
  country: z.string().max(2).optional(),
  timezone: z.string().min(1, 'Timezone is required'),
  currency: z.string().min(1, 'Currency is required'),
})
export type UpdateBusinessProfileInput = z.infer<typeof updateBusinessProfileSchema>

export const createLocationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  address: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
})
export type CreateLocationInput = z.infer<typeof createLocationSchema>

export const createServiceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().positive('Duration must be a positive number'),
  price: z.number().nonnegative('Price must be zero or greater'),
  serviceType: z.enum(['appointment', 'home_mobile', 'group_session', 'rental']),
})
export type CreateServiceInput = z.infer<typeof createServiceSchema>

export const updateServiceSchema = createServiceSchema.extend({
  id: z.string().uuid(),
})
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>

export const createAssetSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().default(true),
})
export type CreateAssetInput = z.infer<typeof createAssetSchema>

export const updateAssetSchema = createAssetSchema.extend({
  id: z.string().uuid(),
})
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>

export const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional(),
  price: z.number().nonnegative('Price must be zero or greater'),
})
export type CreateProductInput = z.infer<typeof createProductSchema>

export const updateProductSchema = createProductSchema.extend({
  id: z.string().uuid(),
})
export type UpdateProductInput = z.infer<typeof updateProductSchema>

export const updateSchedulingSettingsSchema = z.object({
  bookingSlotIntervalMinutes: z.number().int().positive(),
  advanceBookingWindowDays: z.number().int().positive(),
  minimumBookingNoticeMinutes: z.number().int().nonnegative(),
  limitOverlappingAppointments: z.boolean(),
})
export type UpdateSchedulingSettingsInput = z.infer<typeof updateSchedulingSettingsSchema>
