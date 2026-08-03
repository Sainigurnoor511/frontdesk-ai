// Service-role booking path for `appointments` + `clients`, safe to import from
// a standalone Node/worker process (no `next/headers`, no `server-only`-tainted
// imports). Mirrors the `agents-service.ts`/`conversations-service.ts` split —
// see `lib/data/agents-service.ts` for why the session-bound modules can't be
// imported from a worker. All functions take `organizationId` explicitly and
// never trust an LLM-supplied org id.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AppointmentRow } from './calendar'

export type { AppointmentRow }

type ConflictRow = Pick<AppointmentRow, 'id' | 'title' | 'starts_at' | 'ends_at' | 'status'>

/**
 * Simple appointment-overlap check (no business-hours/staff/time-off awareness —
 * tracked as out of scope in TODO). Flags any non-cancelled appointment in the
 * org whose `[starts_at, ends_at)` overlaps the requested range.
 */
export async function checkAvailabilityServiceRole(
  organizationId: string,
  startsAt: string,
  endsAt: string
): Promise<{ available: boolean; conflicts: ConflictRow[] }> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('id, title, starts_at, ends_at, status')
    .eq('organization_id', organizationId)
    .neq('status', 'cancelled')
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt)

  if (error) {
    throw new Error(`Failed to check appointment availability: ${error.message}`)
  }

  const conflicts = (data ?? []) as unknown as ConflictRow[]
  return { available: conflicts.length === 0, conflicts }
}

export type FindOrCreateClientInput = {
  name: string
  phoneNumber: string | null
  email: string | null
}

/**
 * Reuse an existing client within the org instead of spawning duplicates every
 * call — dedupes by phone number first (the primary key of a client), then by
 * email as a fallback so a repeat caller without a captured phone doesn't get a
 * fresh row. A new row is only inserted when a phone number is present
 * (`clients.phone_number` is NOT NULL); otherwise this throws.
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

  if (!phone) {
    throw new Error('A phone number is required to create a client')
  }

  const { data: created, error } = await supabase
    .from('clients')
    .insert({
      organization_id: organizationId,
      name: input.name,
      phone_number: phone,
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
}

export async function createAppointmentServiceRole(
  organizationId: string,
  agentId: string,
  conversationId: string,
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
      status: 'confirmed',
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create appointment: ${error?.message ?? 'unknown error'}`)
  }

  return data as AppointmentRow
}
