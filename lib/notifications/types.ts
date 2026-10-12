// Leaf module: imports nothing, on purpose. It is reachable from the header
// notification center (a client component), so a value import of a service
// module would drag `@supabase/supabase-js` and the `SUPABASE_SECRET_KEY`
// reference in `lib/supabase/service-role.ts` into the client graph.

export const NOTIFICATION_TYPES = [
  'post_call_summary',
  'appointment_reminder',
  'client_booking',
  'staff_booking',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** The four org-level toggles persisted in `organization_settings`. */
export type NotificationPreferences = {
  notifyPostCallSummary: boolean
  notifyAppointmentReminders: boolean
  notifyClientBookings: boolean
  notifyStaffBookings: boolean
}

export const NOTIFICATION_TYPE_TO_PREFERENCE = {
  post_call_summary: 'notifyPostCallSummary',
  appointment_reminder: 'notifyAppointmentReminders',
  client_booking: 'notifyClientBookings',
  staff_booking: 'notifyStaffBookings',
} as const satisfies Record<NotificationType, keyof NotificationPreferences>

/**
 * Events dispatched the moment they happen. `appointment_reminder` is absent on
 * purpose: it is never immediate, so it goes through
 * `scheduleAppointmentReminder()`, which enqueues that type itself.
 */
export type NotificationEvent =
  | { type: 'post_call_summary'; organizationId: string; conversationId: string }
  | { type: 'client_booking'; organizationId: string; appointmentId: string }
  | { type: 'staff_booking'; organizationId: string; appointmentId: string }
