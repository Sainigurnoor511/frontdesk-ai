// Service-role booking path for `appointments` + `clients`, safe to import from
// a standalone Node/worker process (no `next/headers`, no `server-only`-tainted
// imports). Mirrors the `agents-service.ts`/`conversations-service.ts` split —
// see `lib/data/agents-service.ts` for why the session-bound modules can't be
// imported from a worker. All functions take `organizationId` explicitly and
// never trust an LLM-supplied org id.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { dispatchWebhook } from '@/lib/integrations/webhook'
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

  return data as AppointmentRow
}
