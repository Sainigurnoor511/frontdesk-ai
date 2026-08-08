// Service-role booking path for `appointments` + `clients`, safe to import from
// a standalone Node/worker process (no `next/headers`, no `server-only`-tainted
// imports). Mirrors the `agents-service.ts`/`conversations-service.ts` split —
// see `lib/data/agents-service.ts` for why the session-bound modules can't be
// imported from a worker. All functions take `organizationId` explicitly and
// never trust an LLM-supplied org id.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { dispatchWebhook } from '@/lib/integrations/webhook'
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

  void handleAppointmentCreated(organizationId, data.id)
  void handleCalComAppointmentCreated(organizationId, data.id)
  void handleMicrosoftAppointmentCreated(organizationId, data.id)
  void handleCalendlyAppointmentCreated(organizationId, data.id)

  return data as AppointmentRow
}

/**
 * Public lookup for the reschedule/cancel flow — upcoming, non-cancelled
 * appointments for the client matching this email within the org. No auth:
 * scoped by organizationId + exact email match only, mirroring the trust
 * model of the rest of the public booking actions (rate-limited by caller).
 */
export async function getUpcomingAppointmentsByEmailServiceRole(
  organizationId: string,
  email: string
): Promise<AppointmentRow[]> {
  const supabase = createServiceRoleClient()
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('email', email.trim())
    .maybeSingle()

  if (!client) return []

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('client_id', client.id)
    .neq('status', 'cancelled')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  if (error) return []
  return (data ?? []) as AppointmentRow[]
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

export async function reschedulePublicAppointmentServiceRole(
  organizationId: string,
  appointmentId: string,
  email: string,
  startsAt: string,
  endsAt: string
): Promise<{ error: string } | { success: true }> {
  const owned = await assertAppointmentOwnedByEmail(organizationId, appointmentId, email)
  if (!owned) return { error: 'Appointment not found.' }

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('appointments')
    .update({ starts_at: startsAt, ends_at: endsAt, updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)

  if (error) return { error: 'Could not reschedule. Please try again.' }

  void handleAppointmentUpdated(organizationId, appointmentId)
  void handleCalComAppointmentUpdated(organizationId, appointmentId)
  void handleMicrosoftAppointmentUpdated(organizationId, appointmentId)
  void handleCalendlyAppointmentUpdated()

  return { success: true }
}

export async function cancelPublicAppointmentServiceRole(
  organizationId: string,
  appointmentId: string,
  email: string
): Promise<{ error: string } | { success: true }> {
  const owned = await assertAppointmentOwnedByEmail(organizationId, appointmentId, email)
  if (!owned) return { error: 'Appointment not found.' }

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)

  if (error) return { error: 'Could not cancel. Please try again.' }

  void dispatchWebhook(organizationId, 'appointment.cancelled', { appointmentId })

  void handleAppointmentCancelled(organizationId, appointmentId)
  void handleCalComAppointmentCancelled(organizationId, appointmentId)
  void handleMicrosoftAppointmentCancelled(organizationId, appointmentId)
  void handleCalendlyAppointmentCancelled()

  return { success: true }
}
