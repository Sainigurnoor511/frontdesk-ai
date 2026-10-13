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

/**
 * How many rows the header panel lists. The unread badge is capped one below
 * this (`9+`), so any exact number it shows is a number the panel can display.
 */
export const NOTIFICATION_PANEL_LIMIT = 10

// The one copy: scheduler, sweep and the processor's early-fire guard must agree on it.
export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

// Reminder jobs exist in Redis only this close to firing; further out, Postgres is the record.
export const REMINDER_LOOKAHEAD_MS = 48 * 60 * 60 * 1000

// Only `pending` is still owed; `sent`, `skipped` (none owed) and `abandoned` are terminal.
export const NOTIFICATION_EMAIL_STATUSES = ['pending', 'sent', 'skipped', 'abandoned'] as const

export type NotificationEmailStatus = (typeof NOTIFICATION_EMAIL_STATUSES)[number]

/**
 * Dedupe key for an appointment reminder: the appointment *and* the start time
 * it reminds about. A moved appointment is a new deliverable, so its reminder
 * gets a row and an email of its own, while the row for the original time keeps
 * its `email_sent_at` as an honest record that the first reminder went out.
 *
 * Normalized through `Date`, so the database's `+00:00` form and a caller's
 * `.000Z` form of the same instant produce the same key. Returns null for an
 * unparseable time.
 */
export function appointmentReminderDedupeKey(
  appointmentId: string,
  startsAt: string
): string | null {
  const ms = Date.parse(startsAt)
  if (!Number.isFinite(ms)) return null
  return `${appointmentId}:${new Date(ms).toISOString()}`
}

/**
 * The org-level toggles persisted in `organization_settings`.
 *
 * They control **email only**. The in-app row is written whatever they say,
 * because the settings labels name the channel ("Post-call summary — Email"),
 * and a toggle labelled "Email" must not empty the bell as well.
 */
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
