import { z } from 'zod'
import { NOTIFICATION_TYPES } from '@/lib/notifications/types'

/**
 * Narrows a BullMQ job payload at the processor boundary, so a malformed or
 * forged job fails with a readable message instead of throwing a type error
 * deep inside the handler.
 */
export const notificationJobSchema = z.object({
  organizationId: z.string().uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  subjectId: z.string().uuid(),
  /**
   * How many times this delivery has already been pushed into a later
   * `client_booking` rate-limit window. Bounded so a permanently exhausted cap
   * cannot re-enqueue the same booking forever.
   */
  capDeferrals: z.number().int().min(0).max(10).optional(),
})
export type NotificationJobInput = z.infer<typeof notificationJobSchema>

export const notificationIdSchema = z.object({
  id: z.string().uuid(),
})
export type NotificationIdInput = z.infer<typeof notificationIdSchema>
