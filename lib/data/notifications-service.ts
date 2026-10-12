// Service-role notification writes and reads, safe to import from the BullMQ
// worker: no `next/headers`, no `server-only`-tainted imports. The session-client
// counterpart lives in `lib/data/notifications.ts`.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { NotificationType } from '@/lib/notifications/types'

export const MAX_RECIPIENTS = 50
const RECIPIENT_LOOKUP_CHUNK = 10

export type NotificationClaim = { id: string; emailSentAt: string | null }

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
    .select('id, email_sent_at')
    .single()

  if (!error && data) return { id: data.id, emailSentAt: data.email_sent_at }

  // 23505 = unique_violation: someone already claimed this (org, type, subject).
  // Anything else is a real failure.
  if (error?.code !== '23505') {
    throw new Error(`Failed to claim notification: ${error?.message ?? 'unknown error'}`)
  }

  const { data: existing, error: readError } = await supabase
    .from('notifications')
    .select('id, email_sent_at')
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
  return { id: existing.id, emailSentAt: existing.email_sent_at }
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
  const expired = new Date(nowMs - EMAIL_LEASE_MS).toISOString()
  const { data, error } = await createServiceRoleClient()
    .from('notifications')
    .update({
      email_claimed_at: new Date(nowMs).toISOString(),
      email_claim_token: token,
    })
    .eq('id', id)
    .is('email_sent_at', null)
    // Free, ours already, or abandoned long enough to steal.
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
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    // The email is out. Failing the job here would re-send it on the retry,
    // which is worse than a row whose lease simply expires — the retry then
    // re-submits under the same idempotency key and Resend dedupes it.
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
    .select('id, organization_id, title, client_name, client_phone, starts_at, ends_at, status')
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
  }
}
