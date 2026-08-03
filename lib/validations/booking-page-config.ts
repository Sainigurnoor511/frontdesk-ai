import { z } from 'zod'

export const customFieldSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(200),
  type: z.enum(['text', 'dropdown', 'checkbox']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
})

export const updateTypographySchema = z.object({
  headingFont: z.string().min(1),
  bodyFont: z.string().min(1),
  headingSize: z.enum(['sm', 'md', 'lg', 'xl']),
  bodySize: z.enum(['sm', 'md', 'lg']),
  fontWeight: z.enum(['normal', 'medium', 'semibold', 'bold']),
  lineHeight: z.enum(['tight', 'normal', 'relaxed']),
  letterSpacing: z.enum(['tight', 'normal', 'wide']),
})
export type UpdateTypographyInput = z.infer<typeof updateTypographySchema>

export const updateBrandingSchema = z.object({
  logoUrl: z.string().url().nullable(),
  tagline: z.string().max(200).nullable(),
  businessDescription: z.string().max(1000).nullable(),
})
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>

export const updateLayoutSchema = z.object({
  receptionistPosition: z.enum(['left', 'right']),
  showHeader: z.boolean(),
  showServiceDescriptions: z.boolean(),
  showPrices: z.boolean(),
})
export type UpdateLayoutInput = z.infer<typeof updateLayoutSchema>

export const updateMediaSchema = z.object({
  backgroundImageUrl: z.string().url().nullable(),
  backgroundVideoUrl: z.string().url().nullable(),
})
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>

export const updateFormsSchema = z.object({
  customFields: z.array(customFieldSchema),
})
export type UpdateFormsInput = z.infer<typeof updateFormsSchema>

export const updateConfirmationRulesSchema = z.object({
  requireEmailVerification: z.boolean(),
  autoConfirmBookings: z.boolean(),
  cancellationPolicyText: z.string().max(2000).nullable(),
  cancellationNoticeHours: z.number().int().min(0).max(720),
})
export type UpdateConfirmationRulesInput = z.infer<typeof updateConfirmationRulesSchema>

export const updateGlobalBookingFlowSchema = z.object({
  showStaffSelection: z.boolean(),
  showReceptionistOnBookingPage: z.boolean(),
  receptionistOnly: z.boolean(),
  autoGreetOnLoad: z.boolean(),
  showPhoneFallback: z.boolean(),
  callWidgetPosition: z.enum(['bottom-left', 'bottom-right', 'center']),
})
export type UpdateGlobalBookingFlowInput = z.infer<typeof updateGlobalBookingFlowSchema>

export const updateCalendarConfigSchema = z.object({
  bookingSlotIntervalMinutes: z.number().int().min(5).max(240),
  advanceBookingWindowDays: z.number().int().min(1).max(365),
  minimumBookingNoticeMinutes: z.number().int().min(0).max(10_080),
})
export type UpdateCalendarConfigInput = z.infer<typeof updateCalendarConfigSchema>

export const restoreBookingPageVersionSchema = z.object({
  versionId: z.string().uuid(),
})
export type RestoreBookingPageVersionInput = z.infer<typeof restoreBookingPageVersionSchema>
