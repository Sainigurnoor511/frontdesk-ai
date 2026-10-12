// Service-role-safe notification dispatch, importable from both server actions
// and standalone worker processes (no `next/headers`, no `server-only`-tainted
// imports). Mirrors `dispatchWebhook()`: enqueue, and never throw into the
// caller — a call or a booking must not fail because a notification could not
// be enqueued.
//
// No preference is read here. The org's toggles control email only, and the
// in-app row is written regardless, so every event is enqueued; the processor
// reads the email preference at delivery time and decides only whether to send.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  addNotificationJob,
  removeNotificationJob,
  POST_CALL_SUMMARY_ATTEMPTS,
  POST_CALL_SUMMARY_DELAY_MS,
} from '@/lib/queue/queues/notification'
import type { NotificationEvent } from '@/lib/notifications/types'

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

/**
 * Budget for the conversation seam when it is awaited. `lib/queue/connection.ts`
 * sets `maxRetriesPerRequest: null` over ioredis' default offline queue, so with
 * Redis unreachable a bare `queue.add()` never settles — the caller needs a
 * bound, not a `void`.
 */
const SEAM_BUDGET_MS = 3_000

/**
 * Enqueue a notification job. Always — whatever the org's email preference for
 * the type says, because the in-app row is written either way (see the
 * decision comment at the preference check in
 * `lib/queue/processors/notification.ts`).
 */
export async function dispatchNotification(event: NotificationEvent): Promise<void> {
  try {
    const subjectId =
      event.type === 'post_call_summary' ? event.conversationId : event.appointmentId

    await addNotificationJob(
      { organizationId: event.organizationId, type: event.type, subjectId },
      // Only the summary is enqueued before its subject row commits, so only it
      // needs the delay and the wider attempt window.
      event.type === 'post_call_summary'
        ? { delay: POST_CALL_SUMMARY_DELAY_MS, attempts: POST_CALL_SUMMARY_ATTEMPTS }
        : {}
    )
  } catch (error) {
    console.error(
      `[notifications] failed to enqueue ${event.type} for org ${event.organizationId}:`,
      error
    )
  }
}

/**
 * Installs the ~24h-before reminder for an appointment as a delayed job keyed on
 * the appointment, the pattern `lib/voice/providers/assemblyai/enqueue-finalize.ts`
 * already uses.
 *
 * Installed whatever the reminder email preference says: the in-app reminder
 * is always written, and the processor decides about the email at delivery.
 *
 * Safe to call on every write that touches `starts_at`, not just on creation:
 * `addNotificationJob()` drops the job already parked under that id, so a moved
 * appointment ends up with exactly one reminder job, at the new time. Calling it
 * only from the creation paths is what left a rescheduled appointment reminding
 * at its original time. The delivered reminder is keyed on the start time too
 * (`appointmentReminderDedupeKey()`), so a move after the first reminder went
 * out still earns a second one.
 *
 * A booking made less than 24 hours out is skipped: it already produced a
 * booking notification, and a "reminder" seconds later is noise. An appointment
 * *moved* inside that window still has its stale reminder removed first, so
 * "skipped" never means "the old one stands".
 */
export async function scheduleAppointmentReminder(
  organizationId: string,
  appointmentId: string,
  startsAt: string
): Promise<void> {
  try {
    const startsAtMs = Date.parse(startsAt)
    if (!Number.isFinite(startsAtMs)) {
      console.warn(
        `[notifications] unparseable startsAt "${startsAt}" for appointment ${appointmentId}; no reminder scheduled`
      )
      return
    }

    const delay = startsAtMs - REMINDER_LEAD_MS - Date.now()
    if (delay <= 0) {
      await removeNotificationJob('appointment_reminder', appointmentId)
      return
    }

    await addNotificationJob(
      { organizationId, type: 'appointment_reminder', subjectId: appointmentId },
      { delay }
    )
  } catch (error) {
    console.error(
      `[notifications] failed to schedule reminder for appointment ${appointmentId}:`,
      error
    )
  }
}

/**
 * Drops a pending reminder. Called from every cancel path: the processor's
 * `status === 'cancelled'` guard is the backstop, but leaving the job pending
 * means a cancelled appointment still holds a delayed job for up to a month and
 * the row still looks deliverable.
 *
 * Never throws — a cancellation must not fail because Redis is unreachable.
 */
export async function cancelAppointmentReminder(appointmentId: string): Promise<void> {
  try {
    await removeNotificationJob('appointment_reminder', appointmentId)
  } catch (error) {
    console.error(
      `[notifications] failed to cancel reminder for appointment ${appointmentId}:`,
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
 * The appointment half is a backstop, not the primary path: AI-call bookings
 * are notified when they are written (`createAppointmentServiceRole` in
 * `lib/data/booking-service.ts`), so a voice worker killed before its terminal
 * write no longer loses them. Re-dispatching here is idempotent — the same
 * fixed job ids are re-installed, and the row claim on
 * `(org, type, dedupe_key)` plus `email_sent_at` stops a second row or email —
 * and it recovers a creation-time enqueue that was itself lost. No `status`
 * filter: a booking notification records an event that did happen, exactly as
 * the booking call sites do; cancellation only suppresses the *reminder*, at
 * delivery time.
 */
export async function dispatchConversationCompletedNotifications(
  organizationId: string,
  conversationId: string,
  status: 'completed' | 'failed'
): Promise<void> {
  try {
    if (status === 'completed') {
      await dispatchNotification({ type: 'post_call_summary', organizationId, conversationId })
    }

    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from('appointments')
      .select('id, starts_at')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)

    for (const row of (data ?? []) as { id: string; starts_at: string }[]) {
      await dispatchNotification({ type: 'client_booking', organizationId, appointmentId: row.id })
      await scheduleAppointmentReminder(organizationId, row.id, row.starts_at)
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
