import { UnrecoverableError, type Job } from 'bullmq'
import {
  getNotificationPreferences,
  getOrgTimezone,
} from '@/lib/data/organization-settings-service'
import {
  claimNotification,
  claimNotificationEmailLease,
  getAppointmentSubject,
  getConversationSubject,
  getOrganizationName,
  getOrgRecipients,
  markNotificationEmailSent,
  releaseNotificationEmailClaim,
} from '@/lib/data/notifications-service'
import { buildNotificationContent, type NotificationSubject } from '@/lib/notifications/content'
import { NOTIFICATION_TYPE_TO_PREFERENCE } from '@/lib/notifications/types'
import {
  assertNotificationEmailConfigured,
  sendNotificationEmails,
} from '@/lib/email/send-notification-email'
import {
  notificationDeferralJobId,
  notificationQueue,
  type NotificationJobData,
} from '@/lib/queue/queues/notification'
import { notificationJobSchema } from '@/lib/validations/notification'
import {
  checkAndConsumeRateLimit,
  claimRateLimitCharge,
  rateLimitWindowSecondsRemaining,
  releaseRateLimitCharge,
} from '@/lib/voice/rate-limit'

/**
 * Bound on `client_booking` *events* per org per hour. The public booking page
 * is reachable anonymously (it trusts a browser-supplied organization id, gated
 * by `canUseBookingPage` and 5 bookings/hour/IP), so each booking there now
 * produces externally visible email. A single IP can only produce 5 of these 20,
 * so the cap engages for distributed floods and not for a real business.
 */
const MAX_CLIENT_BOOKING_NOTIFICATIONS_PER_HOUR = 20

const CLIENT_BOOKING_WINDOW_SECONDS = 3_600

/**
 * Lifetime of the per-notification marker that records "this booking already
 * took its slot in a window". Longer than the window plus the deferral chain
 * below, so no notification can be charged twice.
 */
const CLIENT_BOOKING_CHARGE_TTL_SECONDS = 6 * 3_600

/**
 * How many times a capped booking email is pushed into a later window before it
 * is given up on. A cap that is still exhausted four hours later is a flood, not
 * a busy afternoon, and re-enqueueing forever would leak jobs.
 */
const MAX_CAP_DEFERRALS = 3

/**
 * Delivers one notification: re-reads the preference, loads the subject, claims
 * the row and the send, and fans the email out to the org's members.
 *
 * Everything is re-read at delivery time — nothing but ids travels in the job
 * payload — so a reminder enqueued 24 hours earlier renders the appointment's
 * current state, and a preference flipped off in between suppresses the send.
 */
export async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  // 1. Validate the payload.
  const parsed = notificationJobSchema.safeParse(job.data)
  if (!parsed.success) {
    throw new UnrecoverableError(
      `[notification] invalid job payload: ${parsed.error.issues[0].message}`
    )
  }

  const { organizationId, type, subjectId, capDeferrals } = parsed.data

  // 2. Re-read the preference. This is the authority; the enqueue-time check
  //    only keeps the queue quiet.
  const preferences = await getNotificationPreferences(organizationId)
  if (!preferences[NOTIFICATION_TYPE_TO_PREFERENCE[type]]) return

  // 3. Load the subject.
  const row =
    type === 'post_call_summary'
      ? await getConversationSubject(subjectId)
      : await getAppointmentSubject(subjectId)

  if (!row) {
    console.warn(`[notifications] ${type} subject ${subjectId} no longer exists; skipping`)
    return
  }

  if (row.organizationId !== organizationId) {
    throw new UnrecoverableError(
      `[notification] subject ${subjectId} belongs to another organization`
    )
  }

  // 4. Map the row onto the content builder's input, and 5. apply the
  //    type-specific suppression that row allows.
  let subject: NotificationSubject

  if ('summary' in row) {
    if (row.status === 'active') {
      // The seam enqueues before the conversation update commits, so "not yet"
      // is normal on attempt 1. Recoverable: attempts 2 and 3 arrive 10 s and
      // 20 s later. Three failures mean the update never landed — and then no
      // email goes out for a call with no outcome.
      throw new Error(`Conversation ${subjectId} is not finalized yet`)
    }

    subject = {
      kind: 'conversation',
      summary: row.summary,
      outcome: row.outcome,
      durationSeconds: row.durationSeconds,
      createdAt: row.createdAt,
    }
  } else {
    // Reminders are about the future, so a cancelled or past appointment
    // suppresses them. The two booking types are deliberately not suppressed on
    // cancellation: they record an event that did happen.
    if (type === 'appointment_reminder') {
      if (row.status === 'cancelled') return
      if (Date.parse(row.startsAt) <= Date.now()) return
    }

    subject = {
      kind: 'appointment',
      // appointments.title — the service booked. NotificationContent.title
      // is the notification headline and is built in step 7.
      title: row.title,
      clientName: row.clientName,
      clientPhone: row.clientPhone,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    }
  }

  // 6. Org name and timezone.
  const [organizationName, timeZone] = await Promise.all([
    getOrganizationName(organizationId),
    getOrgTimezone(organizationId),
  ])

  // 7. Build content.
  const content = buildNotificationContent({ type, subject, organizationName, timeZone })

  // 8. Claim the notification row. `dedupeKey` is always the job's subject id;
  //    `type` is what separates a booking row from its reminder row.
  const notification = await claimNotification({
    organizationId,
    type,
    dedupeKey: subjectId,
    title: content.title,
    body: content.body,
    linkPath: content.linkPath,
  })

  // 9. A completed duplicate: one email per (org, type, subject), across retries
  //    and across process restarts.
  if (notification.emailSentAt !== null) return

  // 10. Bound the anonymous-booking fan-out.
  //
  //     Charged once per notification, not once per attempt: the limiter is a
  //     bare INCR and this processor re-enters at step 1 on every retry, so a
  //     booking that flapped three times used to burn three of the twenty
  //     hourly tokens and shrink the effective cap to about six bookings.
  if (type === 'client_booking') {
    const capKey = `notify:client_booking:${organizationId}`
    const chargeKey = `notify:client_booking:charged:${notification.id}`
    const firstCharge = await claimRateLimitCharge(chargeKey, CLIENT_BOOKING_CHARGE_TTL_SECONDS)

    if (firstCharge) {
      const { allowed } = await checkAndConsumeRateLimit(capKey, {
        max: MAX_CLIENT_BOOKING_NOTIFICATIONS_PER_HOUR,
        windowSeconds: CLIENT_BOOKING_WINDOW_SECONDS,
      })
      if (!allowed) {
        // Not charged after all — the next window re-evaluates from scratch.
        await releaseRateLimitCharge(chargeKey)
        console.warn(
          `[notifications] client_booking email cap reached for org ${organizationId}`
        )
        // The row already exists, so the in-app center still shows the booking.
        // The email is re-attempted past the window boundary rather than
        // dropped: the window reopens minutes later, and nothing else in the
        // system ever scans for unsent rows.
        await deferPastCapWindow(parsed.data, capKey, capDeferrals ?? 0)
        return
      }
    }
  }

  // 11. Fail before claiming the send, so a misconfigured deployment does not
  //     mark the row as sent. Includes NEXT_PUBLIC_SITE_URL: this is the first
  //     email sender that runs inside the standalone worker, where that value
  //     is an ordinary runtime env var rather than a build-time inline, and
  //     without it every CTA would point at http://localhost:3000.
  assertNotificationEmailConfigured()

  // 12. Resolve recipients from live data.
  const recipients = await getOrgRecipients(organizationId)
  if (recipients.length === 0) {
    console.warn(
      `[notifications] org ${organizationId} has no resolvable recipients; notification ${notification.id} stays unsent`
    )
    return
  }

  // 13. Take the delivery lease: false means another worker owns it right now.
  //     A lease, not the sent timestamp — the row is only marked sent once
  //     Resend has the message (step 15), so a crash in between is re-attempted
  //     instead of looking delivered. A retry of *this* job re-takes its own
  //     lease, which is why the token is the job id.
  const claimed = await claimNotificationEmailLease(
    notification.id,
    `job:${job.id ?? 'unknown'}`
  )
  if (!claimed) return

  // 14. Send. `errors[].index` indexes the submitted payload array, which is
  //     built from `recipients` in order — so the order must not be re-sorted
  //     between these two calls.
  const outcome = await sendNotificationEmails(
    recipients.map((recipient) => recipient.email),
    {
      organizationName,
      subject: content.emailSubject,
      heading: content.title,
      intro: content.body,
      details: content.details,
      ctaPath: content.linkPath,
      ctaLabel: content.ctaLabel,
    },
    `notify:${notification.id}`
  )

  // 15. Settle.
  if (outcome.status === 'already_sent') {
    // Resend already has this key: the first request landed (or is landing).
    // That is a delivered email, so make the row durably sent — releasing the
    // lease would licence a second send.
    await markNotificationEmailSent(notification.id)
    console.error(
      `[notifications] notification ${notification.id} was already submitted to Resend: ${outcome.message}`
    )
    return
  }

  if (outcome.status === 'permanent') {
    await releaseNotificationEmailClaim(notification.id)
    throw new UnrecoverableError(outcome.message)
  }

  if (outcome.status === 'retry') {
    await releaseNotificationEmailClaim(notification.id)
    throw new Error(outcome.message)
  }

  // Resend accepted the batch. Only now is the send durable.
  await markNotificationEmailSent(notification.id)

  if (outcome.failedIndices.length > 0) {
    // Per-message rejections inside an accepted batch: retrying would re-send to
    // everyone who already got it, and a malformed address fails identically
    // next time. Member uuids, never addresses (requirement 27).
    const failedMembers = outcome.failedIndices.map(
      (index) => recipients[index]?.userId ?? 'unknown'
    )
    console.error(
      `[notifications] ${outcome.failedIndices.length} recipient(s) rejected for notification ${notification.id}: ${failedMembers.join(', ')}`
    )
  }
}

/**
 * Re-enqueues a capped booking email just past the current window boundary.
 *
 * The job id carries the deferral count instead of reusing
 * `notificationJobId()`: that id belongs to the job running this code, which is
 * active and therefore cannot be removed or re-added. The notification row is
 * already claimed, so the deferred attempt picks up exactly where this one
 * stopped.
 */
async function deferPastCapWindow(
  data: NotificationJobData,
  capKey: string,
  deferrals: number
): Promise<void> {
  const next = deferrals + 1
  if (next > MAX_CAP_DEFERRALS) {
    console.error(
      `[notifications] giving up on the ${data.type} email for ${data.subjectId} after ${MAX_CAP_DEFERRALS} capped windows`
    )
    return
  }

  const remaining = await rateLimitWindowSecondsRemaining(capKey)
  // +5s so the window has demonstrably rolled over; the floor covers a key with
  // no readable TTL.
  const delaySeconds = Math.max(remaining + 5, 60)

  await notificationQueue.add(
    data.type,
    { ...data, capDeferrals: next },
    {
      jobId: notificationDeferralJobId(data.type, data.subjectId, next),
      delay: delaySeconds * 1_000,
    }
  )
}

export function describeNotificationJob(job: Job<NotificationJobData>): string {
  return `type=${job.data.type} subject=${job.data.subjectId}`
}
