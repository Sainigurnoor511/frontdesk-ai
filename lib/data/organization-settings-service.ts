// Service-role reads of org-level settings, safe to import from a standalone
// Node/worker process: no `next/headers`, no `server-only`-tainted imports.
// `lib/data/settings.ts` is the session-client counterpart and is unusable here.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { NotificationPreferences } from '@/lib/notifications/types'

export type { NotificationPreferences }

/**
 * Duplicated from `defaultOrganizationSettings` in `lib/data/settings.ts` on
 * purpose: that function is not exported and its module imports
 * `lib/supabase/server` (which imports `server-only`), so it cannot be reached
 * from a worker path. Values match `00000000000012_organization_settings.sql`,
 * where all four columns are `not null default true`.
 */
export const NOTIFICATION_PREFERENCE_DEFAULTS: NotificationPreferences = {
  notifyPostCallSummary: true,
  notifyAppointmentReminders: true,
  notifyClientBookings: true,
  notifyStaffBookings: true,
}

/**
 * The org's notification toggles. A missing row falls back to the column
 * defaults (a fresh org gets notifications rather than silence); a query error
 * is rethrown so the processor retries instead of emailing an org that had
 * switched everything off.
 */
export async function getNotificationPreferences(
  organizationId: string
): Promise<NotificationPreferences> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('organization_settings')
    .select(
      'notify_post_call_summary, notify_appointment_reminders, notify_client_bookings, notify_staff_bookings'
    )
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read notification preferences: ${error.message}`)
  }

  if (!data) return NOTIFICATION_PREFERENCE_DEFAULTS

  return {
    notifyPostCallSummary: data.notify_post_call_summary,
    notifyAppointmentReminders: data.notify_appointment_reminders,
    notifyClientBookings: data.notify_client_bookings,
    notifyStaffBookings: data.notify_staff_bookings,
  }
}

/**
 * The org's IANA display timezone. `business_profile.timezone` is
 * `not null default 'UTC'` (`00000000000010_business.sql`) and is what the
 * availability engine already treats as authoritative.
 *
 * Errors are swallowed: a wrong timezone must not fail a job that is otherwise
 * deliverable.
 */
export async function getOrgTimezone(organizationId: string): Promise<string> {
  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('business_profile')
      .select('timezone')
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (error) {
      console.warn(`[notifications] timezone read failed for org ${organizationId}:`, error.message)
      return 'UTC'
    }

    return data?.timezone || 'UTC'
  } catch (error) {
    console.warn(`[notifications] timezone read failed for org ${organizationId}:`, error)
    return 'UTC'
  }
}
