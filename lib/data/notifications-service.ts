// Service-role notification writes and reads, safe to import from the BullMQ
// worker: no `next/headers`, no `server-only`-tainted imports. The session-client
// counterpart lives in `lib/data/notifications.ts`.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { NotificationEmailStatus, NotificationType } from '@/lib/notifications/types'

export const MAX_RECIPIENTS = 50
const RECIPIENT_LOOKUP_CHUNK = 10

export type NotificationClaim = {
  id: string
  emailSentAt: string | null
  emailStatus: NotificationEmailStatus
}

export type OwedNotificationEmail = {
  id: string
  organizationId: string
  type: NotificationType
  dedupeKey: string
  createdAt: string
  emailClaimedAt: string | null
  sweepCount: number
  lastSweptAt: string | null
}

export type NotificationRecipient = { userId: string; email: string }

export type ConversationSubjectRow = {
  id: string
  organizationId: string
  status: string
  summary: string | null
  outcome: 'successful' | 'failed' | 'unknown'
  durationSeconds: number
  createdAt: string
}

export type AppointmentSubjectRow = {
  id: string
  organizationId: string
  title: string
  clientName: string
  clientPhone: string | null
  startsAt: string
  endsAt: string
  status: string
  /**
   * Booked through the anonymous public booking page. That is the only writer
   * that sets `client_id` with neither an agent nor a conversation: the voice
   * tool sets `agent_id`, and the dashboard form sets no `client_id` at all.
   */
  publicBooking: boolean
}

/**
 * Makes the notification row exist exactly once per `(org, type, dedupeKey)`.
 *
 * Postgres arbitrates, not application code: a plain insert either wins or comes
 * back as `23505` (unique violation on `notifications_dedupe_idx`), in which
 * case the existing row is read back. Two workers racing therefore produce one
 * row and one claim id.
 */
export async function claimNotification(input: {
  organizationId: string
  type: NotificationType
  dedupeKey: string
  title: string
  body: string
  linkPath: string
}): Promise<NotificationClaim> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      organization_id: input.organizationId,
      type: input.type,
      dedupe_key: input.dedupeKey,
      title: input.title,
      body: input.body,
      link_path: input.linkPath,
    })
    .select('id, email_sent_at, email_status')
    .single()

  if (!error && data) {
    return { id: data.id, emailSentAt: data.email_sent_at, emailStatus: data.email_status }
  }

  // 23505 = unique_violation: someone already claimed this (org, type, subject).
  // Anything else is a real failure.
  if (error?.code !== '23505') {
    throw new Error(`Failed to claim notification: ${error?.message ?? 'unknown error'}`)
  }

  const { data: existing, error: readError } = await supabase
    .from('notifications')
    .select('id, email_sent_at, email_status')
    .eq('organization_id', input.organizationId)
    .eq('type', input.type)
    .eq('dedupe_key', input.dedupeKey)
    .maybeSingle()

  if (readError) throw new Error(`Failed to read notification claim: ${readError.message}`)
  // The conflicting row was deleted between the insert and this read. Throw so
  // BullMQ retries; the next attempt's insert wins cleanly.
  if (!existing) throw new Error('Notification claim vanished; retrying')

  // Deliberately *not* refreshing title/body: the inbox is a log of what was
  // announced. The email always re-reads the subject, so it shows current state.
  // A moved appointment does not need a refresh either: its reminder dedupe key
  // carries the start time, so the new time claims a row of its own.
  return {
    id: existing.id,
    emailSentAt: existing.email_sent_at,
    emailStatus: existing.email_status,
  }
}

/**
 * Hides the reminder rows for an appointment's *earlier* start times once a
 * reminder for its current time has been claimed, so the bell never lists the
 * old date beside the new one.
 *
 * Marked rather than deleted: a superseded row keeps its `email_sent_at`, which
 * is the record that the first reminder did go out. Only the bell and the unread
 * badge filter on `superseded_at`.
 *
 * Throws on failure so BullMQ retries: the row for the new time already exists
 * by now, and the retry re-reads it without sending twice.
 */
export async function supersedeAppointmentReminders(
  organizationId: string,
  appointmentId: string,
  currentDedupeKey: string
): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from('notifications')
    .update({ superseded_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('type', 'appointment_reminder')
    // Appointment ids are uuids, so the prefix carries no LIKE wildcard.
    .like('dedupe_key', `${appointmentId}:%`)
    .neq('dedupe_key', currentDedupeKey)
    .is('superseded_at', null)

  if (error) throw new Error(`Failed to supersede earlier reminders: ${error.message}`)

  // An earlier time's unsent email is no longer owed; the current time's reminder replaces it.
  await skipPendingNotificationEmails(organizationId, 'appointment_reminder', appointmentId, {
    exceptDedupeKey: currentDedupeKey,
  })
}

/** The subject no longer warrants an email (gone, cancelled, started, superseded). */
export async function skipPendingNotificationEmails(
  organizationId: string,
  type: NotificationType,
  subjectId: string,
  options: { exceptDedupeKey?: string } = {}
): Promise<void> {
  let query = createServiceRoleClient()
    .from('notifications')
    .update({ email_status: 'skipped' })
    .eq('organization_id', organizationId)
    .eq('type', type)
    .eq('email_status', 'pending')

  // Appointment ids are uuids, so the prefix carries no LIKE wildcard.
  query =
    type === 'appointment_reminder'
      ? query.like('dedupe_key', `${subjectId}:%`)
      : query.eq('dedupe_key', subjectId)
  if (options.exceptDedupeKey) query = query.neq('dedupe_key', options.exceptDedupeKey)

  const { error } = await query
  if (error) throw new Error(`Failed to skip owed notification emails: ${error.message}`)
}

/** Terminal "no email owed", so the sweep never mails an org that opted out. */
export async function markNotificationEmailSkipped(id: string): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from('notifications')
    .update({ email_status: 'skipped' })
    .eq('id', id)
    .eq('email_status', 'pending')

  if (error) throw new Error(`Failed to mark notification email skipped: ${error.message}`)
}

/**
 * How long a delivery lease held by a *different* worker blocks this one.
 *
 * Long enough that two workers cannot plausibly be inside the same Resend
 * request, short enough that a worker killed mid-send does not park the row for
 * hours. A retry of the same BullMQ job does not wait for it at all — it
 * presents the same token and re-takes its own lease.
 */
export const EMAIL_LEASE_MS = 2 * 60 * 1000

/**
 * What a lease token may contain: the characters of `job:<bullmq job id>`,
 * where job ids are `notify:<type>:<uuid>[:deferN]`. Nothing that PostgREST's
 * filter grammar treats as syntax.
 */
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9:_-]{1,200}$/

/**
 * Takes (or re-takes) the delivery lease. True means "send now".
 *
 * This is deliberately *not* the durable sent timestamp. `email_sent_at` used to
 * be stamped here, before the Resend call, so a worker that exited in that
 * window left a row that looked delivered: the retry saw `email_sent_at !== null`
 * at step 9 and completed without ever contacting the provider. The email was
 * lost with nothing in the system able to detect it.
 *
 * Now the pre-send write is an expiring lease and the send is confirmed by
 * `markNotificationEmailSent()` afterwards, so an interrupted attempt is
 * re-attempted. Re-submitting is safe: the Resend idempotency key is the
 * notification id, so a request that did land is not duplicated.
 */
export async function claimNotificationEmailLease(
  id: string,
  /** Opaque holder id; the processor passes its BullMQ job id. */
  token: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  // The token is interpolated into the PostgREST `.or()` filter below, so the
  // predicate is caller-trusted: a comma, quote or parenthesis would *widen* the
  // filter rather than fail, letting two workers both believe they hold the
  // lease. Today it is always `job:<bullmq id>`; refuse anything else outright.
  if (!LEASE_TOKEN_PATTERN.test(token)) {
    throw new Error(`Refusing malformed notification lease token: ${JSON.stringify(token)}`)
  }

  const expired = new Date(nowMs - EMAIL_LEASE_MS).toISOString()
  const { data, error } = await createServiceRoleClient()
    .from('notifications')
    .update({
      email_claimed_at: new Date(nowMs).toISOString(),
      email_claim_token: token,
    })
    .eq('id', id)
    .is('email_sent_at', null)
    // Only an owed email: `skipped` and `abandoned` rows are never sent.
    .eq('email_status', 'pending')
    // Free, ours already, or held by a dead worker long enough to steal.
    .or(
      `email_claim_token.is.null,email_claim_token.eq."${token}",email_claimed_at.lt."${expired}"`
    )
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to claim notification email: ${error.message}`)
  return Boolean(data)
}

/**
 * Records that the provider accepted the submission. This is the write that
 * makes the send durable and stops every future attempt.
 */
export async function markNotificationEmailSent(id: string): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from('notifications')
    .update({ email_sent_at: new Date().toISOString(), email_status: 'sent' })
    .eq('id', id)

  if (error) {
    // The email is out, and this throw fails the job. The retry re-submits
    // under the same idempotency key (`notify:<notification id>`) and Resend
    // dedupes it — but only for as long as Resend keeps the key, which its docs
    // put at 24 hours (resend.com/docs/dashboard/emails/idempotency-keys).
    //
    // Residual state, accepted: if every attempt fails at this write, the row is
    // left delivered but unstamped (`email_sent_at` null, lease set). The retries
    // themselves land well inside the 24h window (10s exponential backoff, at
    // most five attempts), and so do the sweep's re-queues of the still-pending
    // row (its whole retry schedule ends inside a day), so neither can
    // duplicate. A *re-install* of the same job id more than 24 hours later —
    // the conversation seam firing again — would re-send it once.
    throw new Error(`Failed to record notification email send: ${error.message}`)
  }
}

/**
 * Drops the lease so a retry can re-send immediately. Only correct when the
 * send request itself failed.
 */
export async function releaseNotificationEmailClaim(id: string): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from('notifications')
    .update({ email_claimed_at: null, email_claim_token: null })
    .eq('id', id)

  if (error) {
    // The job is already failing for the send error, which is the more useful
    // signal — log and move on. The lease expires on its own regardless.
    console.error(`[notifications] failed to release email claim for ${id}:`, error.message)
  }
}

/** One keyset page of `pending` rows, oldest first, after the `(created_at, id)` cursor. */
export async function listOwedNotificationEmails(input: {
  createdBefore: string
  after: { createdAt: string; id: string } | null
  limit: number
}): Promise<OwedNotificationEmail[]> {
  let query = createServiceRoleClient()
    .from('notifications')
    .select(
      'id, organization_id, type, dedupe_key, created_at, email_claimed_at, email_sweep_count, email_last_swept_at'
    )
    .eq('email_status', 'pending')
    .lt('created_at', input.createdBefore)

  if (input.after) {
    query = query.or(keysetAfter('created_at', input.after.createdAt, input.after.id))
  }

  const { data, error } = await query.order('created_at').order('id').limit(input.limit)
  if (error) throw new Error(`Failed to list owed notification emails: ${error.message}`)

  return (data ?? []).map(
    (row: {
      id: string
      organization_id: string
      type: NotificationType
      dedupe_key: string
      created_at: string
      email_claimed_at: string | null
      email_sweep_count: number | null
      email_last_swept_at: string | null
    }) => ({
      id: row.id,
      organizationId: row.organization_id,
      type: row.type,
      dedupeKey: row.dedupe_key,
      createdAt: row.created_at,
      emailClaimedAt: row.email_claimed_at,
      sweepCount: row.email_sweep_count ?? 0,
      lastSweptAt: row.email_last_swept_at,
    })
  )
}

/** Conditional on the count read; true means this sweep owns the re-queue. */
export async function recordNotificationEmailSweep(
  id: string,
  previousCount: number,
  nowIso: string = new Date().toISOString()
): Promise<boolean> {
  const { data, error } = await createServiceRoleClient()
    .from('notifications')
    .update({ email_sweep_count: previousCount + 1, email_last_swept_at: nowIso })
    .eq('id', id)
    .eq('email_status', 'pending')
    .eq('email_sweep_count', previousCount)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to record notification sweep: ${error.message}`)
  return Boolean(data)
}

export async function abandonNotificationEmail(id: string): Promise<boolean> {
  const { data, error } = await createServiceRoleClient()
    .from('notifications')
    .update({ email_status: 'abandoned' })
    .eq('id', id)
    .eq('email_status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to abandon notification email: ${error.message}`)
  return Boolean(data)
}

export async function countNotificationEmails(status: 'pending' | 'abandoned'): Promise<number> {
  const { count, error } = await createServiceRoleClient()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('email_status', status)

  if (error) throw new Error(`Failed to count ${status} notification emails: ${error.message}`)
  return count ?? 0
}

/** Pass the raw DB string: a `Date` round trip drops microseconds and re-reads the cursor row. */
export function keysetAfter(column: string, value: string, id: string): string {
  return `${column}.gt."${value}",and(${column}.eq."${value}",id.gt."${id}")`
}

/**
 * The org's members, resolved to email addresses at delivery time (requirement
 * 8): `members` carries no email column, so each `user_id` is looked up through
 * the Auth admin API on the service-role client.
 *
 * An errored `members` read throws — that is not "an org with no members", and
 * the job must retry rather than complete and strand the row looking
 * deliverable. A per-user lookup gets the same treatment unless the failure
 * really is "this user has no email": a 404 or a `user_not_found` is data, and
 * is skipped with a warning by uuid (never by address); a 500, a 429 or a
 * network error is transport, and throws so BullMQ retries the whole
 * notification. Turning the second into "no email" is how a brief Auth outage
 * used to drop recipients permanently — with the row marked sent, those staff
 * would never get it.
 */
export async function getOrgRecipients(organizationId: string): Promise<NotificationRecipient[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .order('created_at')
    .limit(MAX_RECIPIENTS)

  if (error) throw new Error(`Failed to resolve recipients: ${error.message}`)

  const userIds = (data ?? []).map((row: { user_id: string }) => row.user_id)
  if (userIds.length === MAX_RECIPIENTS) {
    console.warn(
      `[notifications] org ${organizationId} has at least ${MAX_RECIPIENTS} members; notifying the first ${MAX_RECIPIENTS}`
    )
  }

  const byEmail = new Map<string, NotificationRecipient>()

  for (let index = 0; index < userIds.length; index += RECIPIENT_LOOKUP_CHUNK) {
    const chunk = userIds.slice(index, index + RECIPIENT_LOOKUP_CHUNK)
    const resolved = await Promise.all(
      chunk.map(async (userId) => {
        const { data: result, error: lookupError } = await supabase.auth.admin.getUserById(userId)

        if (lookupError && !isMissingUserError(lookupError)) {
          throw new Error(
            `Failed to resolve recipient ${userId}: ${lookupError.message ?? 'unknown error'}`
          )
        }

        const email = result?.user?.email
        if (!email) {
          console.warn(`[notifications] no email for member ${userId}`)
          return null
        }
        return { userId, email }
      })
    )

    for (const recipient of resolved) {
      if (recipient && !byEmail.has(recipient.email)) byEmail.set(recipient.email, recipient)
    }
  }

  return [...byEmail.values()]
}

/**
 * "This user is not there" versus "the lookup did not work". Only the first is
 * safe to skip. Supabase's `AuthError` carries an HTTP `status` and, on newer
 * clients, a stable `code`; a thrown network error carries neither and so is
 * never treated as missing.
 */
function isMissingUserError(error: { status?: number; code?: string; message?: string }): boolean {
  if (error.code === 'user_not_found') return true
  if (error.status === 404) return true
  // Older clients only give a message.
  return !error.status && !error.code && /user not found/i.test(error.message ?? '')
}

/** `organizations.name`, with a neutral fallback. Not `business_profile.business_name`, which is nullable. */
export async function getOrganizationName(organizationId: string): Promise<string> {
  try {
    const { data, error } = await createServiceRoleClient()
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle()

    if (error || !data?.name) {
      if (error) {
        console.warn(`[notifications] org name read failed for ${organizationId}:`, error.message)
      }
      return 'Your organization'
    }

    return data.name
  } catch (error) {
    console.warn(`[notifications] org name read failed for ${organizationId}:`, error)
    return 'Your organization'
  }
}

/** The conversation a `post_call_summary` job refers to, or null when it is gone. */
export async function getConversationSubject(
  conversationId: string
): Promise<ConversationSubjectRow | null> {
  const { data, error } = await createServiceRoleClient()
    .from('conversations')
    .select('id, organization_id, status, summary, outcome, duration_seconds, created_at')
    .eq('id', conversationId)
    .maybeSingle()

  if (error) throw new Error(`Failed to read conversation ${conversationId}: ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    organizationId: data.organization_id,
    status: data.status,
    summary: data.summary,
    outcome: data.outcome,
    durationSeconds: data.duration_seconds ?? 0,
    createdAt: data.created_at,
  }
}

/** The appointment a booking or reminder job refers to, or null when it is gone. */
export async function getAppointmentSubject(
  appointmentId: string
): Promise<AppointmentSubjectRow | null> {
  const { data, error } = await createServiceRoleClient()
    .from('appointments')
    .select(
      'id, organization_id, title, client_name, client_phone, starts_at, ends_at, status, agent_id, conversation_id, client_id'
    )
    .eq('id', appointmentId)
    .maybeSingle()

  if (error) throw new Error(`Failed to read appointment ${appointmentId}: ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    organizationId: data.organization_id,
    title: data.title,
    clientName: data.client_name,
    clientPhone: data.client_phone,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    status: data.status,
    publicBooking: data.agent_id == null && data.conversation_id == null && data.client_id != null,
  }
}
