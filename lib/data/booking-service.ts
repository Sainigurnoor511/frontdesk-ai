// Service-role booking path for `appointments` + `clients`, safe to import from
// a standalone Node/worker process (no `next/headers`, no `server-only`-tainted
// imports). Mirrors the `agents-service.ts`/`conversations-service.ts` split —
// see `lib/data/agents-service.ts` for why the session-bound modules can't be
// imported from a worker. All functions take `organizationId` explicitly and
// never trust an LLM-supplied org id.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { dispatchWebhook } from '@/lib/integrations/webhook'
import {
  cancelAppointmentReminder,
  dispatchNotification,
  scheduleAppointmentReminder,
} from '@/lib/notifications/dispatch'
import {
  handleAppointmentCreated,
  handleAppointmentUpdated,
  handleAppointmentCancelled,
} from '@/lib/integrations/google-calendar-sync'
import {
  handleCalComAppointmentCancelled,
  handleCalComAppointmentCreated,
  handleCalComAppointmentUpdated,
} from '@/lib/integrations/calcom'
import {
  handleMicrosoftAppointmentCancelled,
  handleMicrosoftAppointmentCreated,
  handleMicrosoftAppointmentUpdated,
} from '@/lib/integrations/microsoft-calendar-sync'
import {
  handleCalendlyAppointmentCancelled,
  handleCalendlyAppointmentCreated,
  handleCalendlyAppointmentUpdated,
} from '@/lib/integrations/calendly'
import type { AppointmentRow } from './calendar'

export type { AppointmentRow }

export type FindOrCreateClientInput = {
  name: string
  phoneNumber: string | null
  email: string | null
}

/**
 * Reuse an existing client within the org instead of spawning duplicates every
 * call — dedupes by phone number first (the primary key of a client), then by
 * email as a fallback so a repeat caller without a captured phone doesn't get a
 * fresh row. `clients.phone_number` is NOT NULL, so a new row with no phone
 * captured (e.g. the public booking page's phone-optional contact step) inserts
 * with an `'unknown'` sentinel rather than failing.
 */
export async function findOrCreateClientServiceRole(
  organizationId: string,
  input: FindOrCreateClientInput
): Promise<{ id: string; isNew: boolean }> {
  const supabase = createServiceRoleClient()

  const phone = input.phoneNumber?.trim() || null
  const email = input.email?.trim() || null

  if (phone) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone_number', phone)
      .maybeSingle()
    if (existing) return { id: existing.id, isNew: false }
  } else if (email) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .maybeSingle()
    if (existing) return { id: existing.id, isNew: false }
  }

  const { data: created, error } = await supabase
    .from('clients')
    .insert({
      organization_id: organizationId,
      name: input.name,
      // `clients.phone_number` is NOT NULL — a booking with no phone (e.g. the
      // public booking page's phone-optional contact step) still needs a value.
      phone_number: phone ?? 'unknown',
      email,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`Failed to create client: ${error?.message ?? 'unknown error'}`)
  }

  return { id: created.id, isNew: true }
}

export type CreateAppointmentServiceInput = {
  title: string
  clientName: string
  clientPhone: string | null
  clientId: string
  startsAt: string
  endsAt: string
  notes?: string | null
  serviceId?: string | null
  staffId?: string | null
}

export async function createAppointmentServiceRole(
  organizationId: string,
  agentId: string | null,
  conversationId: string | null,
  input: CreateAppointmentServiceInput
): Promise<AppointmentRow> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: organizationId,
      agent_id: agentId,
      title: input.title,
      client_name: input.clientName,
      client_phone: input.clientPhone,
      client_id: input.clientId,
      conversation_id: conversationId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      notes: input.notes ?? null,
      service_id: input.serviceId ?? null,
      staff_id: input.staffId ?? null,
      status: 'confirmed',
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create appointment: ${error?.message ?? 'unknown error'}`)
  }

  // Webhook delivery is fire-and-forget and never fails the booking.
  void dispatchWebhook(organizationId, 'appointment.created', {
    appointmentId: data.id,
    title: data.title,
    clientName: data.client_name,
    clientPhone: data.client_phone,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    serviceId: data.service_id,
    staffId: data.staff_id,
    source: agentId ? 'voice' : 'public',
  })

  // Notified where the booking is written — the `book_appointment` voice tool
  // and the public booking page both land here — so a phone booking no longer
  // depends on the call's terminal write landing. That seam still re-dispatches
  // as a backstop; the fixed job ids and the row claim make the repeat a no-op.
  // Both helpers never throw, and the `.catch` is belt and braces: nothing here
  // may fail or delay a booking that is already committed.
  void dispatchNotification({
    type: 'client_booking',
    organizationId,
    appointmentId: data.id,
  }).catch((error) => console.error('[notifications] booking dispatch failed:', error))
  void scheduleAppointmentReminder(organizationId, data.id, data.starts_at).catch((error) =>
    console.error('[notifications] reminder scheduling failed:', error)
  )

  void handleAppointmentCreated(organizationId, data.id)
  void handleCalComAppointmentCreated(organizationId, data.id)
  void handleMicrosoftAppointmentCreated(organizationId, data.id)
  void handleCalendlyAppointmentCreated(organizationId, data.id)

  return data as AppointmentRow
}

/** Past rows read back per lookup. See the two-query note on the function below. */
const LOOKBACK_ROW_LIMIT = 25

/**
 * Every appointment belonging to the client(s) with this email in this org,
 * from `sinceIso` (default: now) onwards, in every status.
 *
 * Shared by the public manage-booking lookup and the voice manage-booking
 * tools. Three properties the voice path depends on:
 *
 *  - **Cancelled and past rows are returned.** That is what lets a caller be
 *    told "that one was already cancelled" or "that one already happened"
 *    instead of a flat "no appointment found".
 *  - **A Postgres error throws; it never comes back as `[]`.** supabase-js
 *    resolves with `{ data: null, error }` rather than rejecting, so without
 *    this a dead database would be indistinguishable from "this caller has
 *    nothing booked" — and the caller would be told they have no appointment.
 *  - **Future rows can never be crowded out by history.** When `sinceIso` is in
 *    the past this issues *two* queries — the forward one bounded by `limit`,
 *    and a separate descending lookback bounded by `LOOKBACK_ROW_LIMIT` — then
 *    merges them. A single `order('starts_at').limit(n)` over a window that
 *    starts in the past keeps the *earliest* n rows, so a shared address
 *    (`reception@`, a coordinator booking for a family) with heavy recent
 *    history would spend the whole row budget on rows the tools cannot act on
 *    and the caller would be told they have nothing booked.
 *
 * No `.maybeSingle()` on the client lookup: two client rows in one org can
 * share an address (`findOrCreateClientServiceRole` dedupes on phone first), so
 * every matching id is collected.
 */
export async function findClientAppointmentsByEmailServiceRole(
  organizationId: string,
  email: string,
  options?: { sinceIso?: string; limit?: number }
): Promise<AppointmentRow[]> {
  const normalized = email.trim()
  if (!normalized) return []

  const supabase = createServiceRoleClient()

  // `ilike` rather than `eq` because emails are stored with whatever case the
  // booking path captured, while a voice model spelling an address back emits
  // lowercase — exact matching strands those callers.
  //
  // '_' is left unescaped on purpose: as a LIKE wildcard it can only widen the
  // candidate set, and the JS equality check below is what authorizes.
  const { data: clientRows, error: clientError } = await supabase
    .from('clients')
    .select('id, email')
    .eq('organization_id', organizationId)
    .ilike('email', normalized)

  if (clientError) throw new Error(`client lookup failed: ${clientError.message}`)

  const wanted = normalized.toLowerCase()
  const ids = ((clientRows ?? []) as { id: string; email: string | null }[])
    .filter((row) => row.email?.toLowerCase() === wanted)
    .map((row) => row.id)
  if (ids.length === 0) return []

  const nowIso = new Date().toISOString()
  const sinceIso = options?.sinceIso ?? nowIso
  const limit = options?.limit ?? 50
  // When the caller asked for a lookback window, the forward query starts at
  // now and the lookback is a second query; otherwise `sinceIso` is already in
  // the future and one query is the whole read.
  const hasLookback = sinceIso < nowIso

  const { data: forwardRows, error: forwardError } = await supabase
    .from('appointments')
    .select('*')
    .eq('organization_id', organizationId)
    .in('client_id', ids)
    .gte('starts_at', hasLookback ? nowIso : sinceIso)
    .order('starts_at', { ascending: true })
    .limit(limit)

  if (forwardError) throw new Error(`appointment lookup failed: ${forwardError.message}`)

  if (!hasLookback) return (forwardRows ?? []) as AppointmentRow[]

  const { data: pastRows, error: pastError } = await supabase
    .from('appointments')
    .select('*')
    .eq('organization_id', organizationId)
    .in('client_id', ids)
    .gte('starts_at', sinceIso)
    .lt('starts_at', nowIso)
    .order('starts_at', { ascending: false })
    .limit(LOOKBACK_ROW_LIMIT)

  if (pastError) throw new Error(`appointment lookback failed: ${pastError.message}`)

  return [...((pastRows ?? []) as AppointmentRow[]), ...((forwardRows ?? []) as AppointmentRow[])]
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
}

/**
 * Public lookup for the reschedule/cancel flow — upcoming, non-cancelled
 * appointments for the client matching this email within the org.
 *
 * **No authentication and no rate limit.** The only scoping is organizationId
 * plus an exact (case-insensitive) email match, so anyone who can guess a
 * client's address can list that client's upcoming appointments. The three
 * public manage-booking actions in `app/smb/actions.ts` that reach this —
 * `lookupPublicAppointments`, `reschedulePublicAppointment`,
 * `cancelPublicAppointment` — carry no `checkAndConsumeRateLimit`, and the
 * Turnstile block in the booking actions is behind `if (false && ...)`. An
 * earlier version of this comment claimed these were "rate-limited by caller";
 * they are not. Adding the rate limit and reviving the Turnstile guard are
 * backlog items in `developer-docs/TODO.md`.
 *
 * Throws on a read failure rather than returning `[]`, so the booking page can
 * tell "something went wrong" apart from "you have nothing booked" — the voice
 * path already distinguishes the two as `lookup_failed`. `lookupPublicAppointments`
 * catches it and renders a real error state.
 *
 * The 500-row cap is applied in SQL and the cancelled filter in JS after it, so
 * the effective ceiling is "500 upcoming rows minus however many are
 * cancelled". That is far above any real client's upcoming book, and the query
 * was previously uncapped.
 */
export async function getUpcomingAppointmentsByEmailServiceRole(
  organizationId: string,
  email: string
): Promise<AppointmentRow[]> {
  const rows = await findClientAppointmentsByEmailServiceRole(organizationId, email, {
    limit: 500,
  })
  return rows.filter((row) => row.status !== 'cancelled')
}

/**
 * Verifies the appointment belongs to a client with the given email before
 * mutating it — the email is the only credential a public caller has, so
 * every reschedule/cancel must re-check this ownership server-side.
 */
async function assertAppointmentOwnedByEmail(
  organizationId: string,
  appointmentId: string,
  email: string
): Promise<boolean> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('appointments')
    .select('client_id, clients(email)')
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!data) return false
  const client = Array.isArray(data.clients) ? data.clients[0] : data.clients
  return client?.email?.toLowerCase() === email.trim().toLowerCase()
}

/**
 * `code` lets a caller tell the failure modes apart — the voice tools report
 * `not_found` as "I can't find that appointment", `conflict` as "that booking
 * changed while we were talking", `slot_taken` as an alternatives offer, and
 * `update_failed` as an apology, where the human `error` string alone would
 * collapse them into one sentence. Every string is user-facing, because the
 * public booking page renders `error` verbatim.
 */
export type AppointmentMutationResult =
  | { success: true }
  | { error: string; code: 'not_found' | 'update_failed' | 'conflict' | 'slot_taken' }

/**
 * The start time the caller confirmed, for optimistic concurrency.
 *
 * Both mutations used to issue a bare `UPDATE` filtered only by appointment id
 * and organization, so a caller could confirm one time on the phone and have a
 * concurrently-changed appointment silently overwritten or cancelled instead.
 * Passing the `starts_at` the decision was made against makes the write
 * conditional on the state that was actually checked; a mismatch returns
 * `conflict` and writes nothing. Optional because the public booking page's
 * schemas carry only an appointment id, so it has no confirmed start to pin to.
 */
export type ExpectedAppointmentState = { startsAt: string }

/**
 * Moves an appointment after re-verifying the email owns it. Named "ByEmail"
 * rather than "Public" because the voice manage-booking tools call it too — the
 * credential, not the entry point, is what this function is specific to.
 *
 * The write itself goes through the `reschedule_appointment_atomic` function
 * (migration `045`), which takes an org-scoped advisory lock, re-checks the
 * expected start, and re-checks the destination for overlapping appointments
 * inside one transaction. Doing the overlap check here in JS — as the caller's
 * availability check does — leaves a window where two callers both pass and
 * both land on the same slot.
 */
export async function rescheduleAppointmentByEmailServiceRole(
  organizationId: string,
  appointmentId: string,
  email: string,
  startsAt: string,
  endsAt: string,
  expected?: ExpectedAppointmentState
): Promise<AppointmentMutationResult> {
  const owned = await assertAppointmentOwnedByEmail(organizationId, appointmentId, email)
  if (!owned) return { error: 'Appointment not found.', code: 'not_found' }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('reschedule_appointment_atomic', {
    p_organization_id: organizationId,
    p_appointment_id: appointmentId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_expected_starts_at: expected?.startsAt ?? null,
  })

  if (error) return { error: 'Could not reschedule. Please try again.', code: 'update_failed' }

  switch (data as string | null) {
    case 'ok':
      break
    case 'not_found':
      return { error: 'Appointment not found.', code: 'not_found' }
    case 'conflict':
      return {
        error: 'That appointment changed before we could move it. Please look it up again.',
        code: 'conflict',
      }
    case 'destination_conflict':
      return { error: 'That time is no longer available.', code: 'slot_taken' }
    default:
      return { error: 'Could not reschedule. Please try again.', code: 'update_failed' }
  }

  // The appointment moved, so the reminder moves with it. This is the only
  // reschedule write in the product — the public booking page and the
  // `reschedule_appointment` voice tool both land here — so one call covers
  // both entry points.
  void scheduleAppointmentReminder(organizationId, appointmentId, startsAt)

  void handleAppointmentUpdated(organizationId, appointmentId)
  void handleCalComAppointmentUpdated(organizationId, appointmentId)
  void handleMicrosoftAppointmentUpdated(organizationId, appointmentId)
  void handleCalendlyAppointmentUpdated()

  return { success: true }
}

/**
 * Cancels an appointment after re-verifying the email owns it. See the rename
 * note above.
 *
 * The update is conditional on the appointment still being uncancelled and, when
 * `expected` is given, still starting when the caller confirmed. `.select('id')`
 * is what turns that into a check: a conditional `UPDATE` that matches nothing
 * is not an error in PostgREST, so without reading the affected rows back a
 * stale cancel would report success.
 */
export async function cancelAppointmentByEmailServiceRole(
  organizationId: string,
  appointmentId: string,
  email: string,
  expected?: ExpectedAppointmentState
): Promise<AppointmentMutationResult> {
  const owned = await assertAppointmentOwnedByEmail(organizationId, appointmentId, email)
  if (!owned) return { error: 'Appointment not found.', code: 'not_found' }

  const supabase = createServiceRoleClient()
  let query = supabase
    .from('appointments')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)
    .neq('status', 'cancelled')

  if (expected) {
    query = query.eq('starts_at', expected.startsAt)
  }

  const { data: updated, error } = await query.select('id')

  if (error) return { error: 'Could not cancel. Please try again.', code: 'update_failed' }
  if (!updated || updated.length === 0) {
    return {
      error: 'That appointment changed before we could cancel it. Please look it up again.',
      code: 'conflict',
    }
  }

  void dispatchWebhook(organizationId, 'appointment.cancelled', { appointmentId })

  // Same reach as the reschedule above: the public cancel action and the
  // `cancel_appointment` voice tool both come through here.
  void cancelAppointmentReminder(appointmentId)

  void handleAppointmentCancelled(organizationId, appointmentId)
  void handleCalComAppointmentCancelled(organizationId, appointmentId)
  void handleMicrosoftAppointmentCancelled(organizationId, appointmentId)
  void handleCalendlyAppointmentCancelled()

  return { success: true }
}
