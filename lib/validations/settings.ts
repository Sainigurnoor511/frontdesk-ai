import { z } from 'zod'

export const updateNotificationSettingsSchema = z
  .object({
    notifyPostCallSummary: z.boolean(),
    notifyAppointmentReminders: z.boolean(),
    notifyClientBookings: z.boolean(),
    notifyStaffBookings: z.boolean(),
  })
  .partial()
export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>

export const updateFeatureSettingsSchema = z
  .object({
    featureServices: z.boolean(),
    featureStaff: z.boolean(),
    featureAssets: z.boolean(),
    featureProducts: z.boolean(),
    featureAvailability: z.boolean(),
    featureCustomTimezones: z.boolean(),
    featureBookingPage: z.boolean(),
    featureMessages: z.boolean(),
    featureFaq: z.boolean(),
    featureAppointments: z.boolean(),
    featureHomeMobile: z.boolean(),
    featureGroupSessions: z.boolean(),
    featureRentals: z.boolean(),
    featureGuides: z.boolean(),
  })
  .partial()
export type UpdateFeatureSettingsInput = z.infer<typeof updateFeatureSettingsSchema>

export const updateBookingPageSettingsSchema = z.object({
  bookingPageEnabled: z.boolean(),
})
export type UpdateBookingPageSettingsInput = z.infer<typeof updateBookingPageSettingsSchema>
