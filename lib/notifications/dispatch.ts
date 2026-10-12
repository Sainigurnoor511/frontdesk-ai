// Service-role-safe notification dispatch, importable from both server actions
// and standalone worker processes (no `next/headers`, no `server-only`-tainted
// imports). Mirrors `dispatchWebhook()`: read the org's preference, enqueue, and
// never throw into the caller — a call or a booking must not fail because a
// notification could not be enqueued.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  getNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/data/organization-settings-service'
import {
  notificationJobId,
  notificationQueue,
  POST_CALL_SUMMARY_DELAY_MS,
} from '@/lib/queue/queues/notification'
import {
  NOTIFICATION_TYPE_TO_PREFERENCE,
  type NotificationEvent,
} from '@/lib/notifications/types'

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

/**
 * Budget for the conversation seam when it is awaited. `lib/queue/connection.ts`
 * sets `maxRetriesPerRequest: null` over ioredis' default offline queue, so with
 * Redis unreachable a bare `queue.add()` never settles — the caller needs a
 * bound, not a `void`.
 */
const SEAM_BUDGET_MS = 3_000

/**
 * Enqueue a notification job when the org's preference for that type is on.
 *
 * `preferences` can be preloaded so a caller dispatching several notifications
 * pays for one settings read instead of one per event.
 */
export async function dispatchNotification(
  event: NotificationEvent,
  preferences?: NotificationPreferences
): Promise<void> {
  try {
    const resolved = preferences ?? (await getNotificationPreferences(event.organizationId))
    if (!resolved[NOTIFICATION_TYPE_TO_PREFERENCE[event.type]]) return

    const subjectId =
      event.type === 'post_call_summary' ? event.conversationId : event.appointmentId

    await notificationQueue.add(
      event.type,
      { organizationId: event.organizationId, type: event.type, subjectId },
      {
        jobId: notificationJobId(event.type, subjectId),
        // Only the summary is enqueued before its subject row commits.
        ...(event.type === 'post_call_summary' ? { delay: POST_CALL_SUMMARY_DELAY_MS } : {}),
      }
    )
  } catch (error) {
    console.error(
      `[notifications] failed to enqueue ${event.type} for org ${event.organizationId}:`,
      error
    )
  }
}

/**
 * Schedule the ~24h-before reminder for an appointment as a delayed job keyed on
 * the appointment, the pattern `lib/voice/providers/assemblyai/enqueue-finalize.ts`
 * already uses.
 *
 * A booking made less than 24 hours out is skipped: it already produced a
 * booking notification, and a "reminder" seconds later is noise.
 */
export async function scheduleAppointmentReminder(
  organizationId: string,
  appointmentId: string,
  startsAt: string,
  preferences?: NotificationPreferences
): Promise<void> {
  try {
    const resolved = preferences ?? (await getNotificationPreferences(organizationId))
    if (!resolved.notifyAppointmentReminders) return

    const startsAtMs = Date.parse(startsAt)
    if (!Number.isFinite(startsAtMs)) {
      console.warn(
        `[notifications] unparseable startsAt "${startsAt}" for appointment ${appointmentId}; no reminder scheduled`
      )
      return
    }

    const delay = startsAtMs - REMINDER_LEAD_MS - Date.now()
    if (delay <= 0) return

    await notificationQueue.add(
      'appointment_reminder',
      { organizationId, type: 'appointment_reminder', subjectId: appointmentId },
      { jobId: notificationJobId('appointment_reminder', appointmentId), delay }
    )
  } catch (error) {
    console.error(
      `[notifications] failed to schedule reminder for appointment ${appointmentId}:`,
      error
    )
  }
}

/**
 * Everything a terminal conversation should notify about, in one never-throwing
 * call so `updateConversationStatus` needs no try/catch of its own.
 *
 * Ordering matters: the post-call summary — requirement 1's headline trigger —
 * is enqueued before the seam spends any further round trips, because on LiveKit
 * the whole function races the job process's exit.
 *
 * The appointment lookup is a seam: AI-call bookings are notified at call end
 * because the right home (`createAppointmentServiceRole` in
 * `lib/data/booking-service.ts`) is owned by a concurrent run. No `status`
 * filter — a booking notification records an event that did happen, exactly as
 * the two booking call sites do; cancellation only suppresses the *reminder*, at
 * delivery time.
 */
export async function dispatchConversationCompletedNotifications(
  organizationId: string,
  conversationId: string,
  status: 'completed' | 'failed'
): Promise<void> {
  try {
    // One preferences read for the whole seam, passed down, so the booking half
    // costs no extra round trip.
    const preferences = await getNotificationPreferences(organizationId)

    if (status === 'completed') {
      await dispatchNotification(
        { type: 'post_call_summary', organizationId, conversationId },
        preferences
      )
    }

    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from('appointments')
      .select('id, starts_at')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)

    for (const row of (data ?? []) as { id: string; starts_at: string }[]) {
      await dispatchNotification(
        { type: 'client_booking', organizationId, appointmentId: row.id },
        preferences
      )
      await scheduleAppointmentReminder(organizationId, row.id, row.starts_at, preferences)
    }
  } catch (error) {
    console.error(`[notifications] conversation ${conversationId} dispatch failed:`, error)
  }
}

/**
 * The seam as the voice paths must call it: awaited (so LiveKit's
 * `process.exit(0)` after its shutdown callbacks cannot kill the enqueue) but
 * bounded (so Redis being unreachable cannot stall the conversation write).
 *
 * Never throws and never hangs. The call site places it *before* its existing
 * write, so no added `await` sits between a write and the work that follows it.
 */
export async function dispatchConversationCompletedNotificationsBounded(
  organizationId: string,
  conversationId: string,
  status: 'completed' | 'failed'
): Promise<void> {
  await Promise.race([
    dispatchConversationCompletedNotifications(organizationId, conversationId, status),
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SEAM_BUDGET_MS)
      // Don't hold the process open for the budget in a short-lived worker.
      timer.unref?.()
    }),
  ])
}
