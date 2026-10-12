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

/** Conditional UPDATE: true only for the caller that flips `email_sent_at` from null. */
export async function claimNotificationEmail(id: string): Promise<boolean> {
  const { data, error } = await createServiceRoleClient()
    .from('notifications')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', id)
    .is('email_sent_at', null)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to claim notification email: ${error.message}`)
  return Boolean(data)
}

/** Undoes the claim so a retry can re-send. Only correct when the send request failed. */
export async function releaseNotificationEmailClaim(id: string): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from('notifications')
    .update({ email_sent_at: null })
    .eq('id', id)

  if (error) {
    // The job is already failing for the send error, which is the more useful
    // signal — log and move on.
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
 * deliverable. Per-user failures stay skip-and-warn, by uuid, never by address.
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
        try {
          const { data: result, error: lookupError } =
            await supabase.auth.admin.getUserById(userId)
          const email = result?.user?.email
          if (lookupError || !email) {
            console.warn(`[notifications] no email for member ${userId}`)
            return null
          }
          return { userId, email }
        } catch {
          console.warn(`[notifications] no email for member ${userId}`)
          return null
        }
      })
    )

    for (const recipient of resolved) {
      if (recipient && !byEmail.has(recipient.email)) byEmail.set(recipient.email, recipient)
    }
  }

  return [...byEmail.values()]
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
