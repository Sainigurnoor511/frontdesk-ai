'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  createAppointmentSchema,
  createTimeOffSchema,
  updateAppointmentSchema,
  type CreateAppointmentInput,
  type CreateTimeOffInput,
  type UpdateAppointmentInput,
} from '@/lib/validations/calendar'

export async function createAppointment(
  input: CreateAppointmentInput
): Promise<{ error: string } | { success: true }> {
  const parsed = createAppointmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to create an appointment.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase.from('appointments').insert({
    organization_id: member.organization_id,
    title: parsed.data.title,
    client_name: parsed.data.clientName,
    client_phone: parsed.data.clientPhone || null,
    starts_at: parsed.data.startsAt,
    ends_at: parsed.data.endsAt,
    notes: parsed.data.notes,
    internal_notes: parsed.data.internalNotes,
  })

  if (error) {
    return { error: 'Could not create appointment. Please try again.' }
  }

  revalidatePath('/calendar')
  return { success: true }
}

export async function cancelAppointment(
  id: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to cancel an appointment.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not cancel appointment. Please try again.' }
  }

  revalidatePath('/calendar')
  return { success: true }
}

export async function updateAppointment(
  id: string,
  input: UpdateAppointmentInput
): Promise<{ error: string } | { success: true }> {
  const parsed = updateAppointmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update an appointment.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase
    .from('appointments')
    .update({
      title: parsed.data.title,
      client_name: parsed.data.clientName,
      client_phone: parsed.data.clientPhone || null,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      notes: parsed.data.notes,
      internal_notes: parsed.data.internalNotes,
    })
    .eq('id', id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not update appointment. Please try again.' }
  }

  revalidatePath('/calendar')
  return { success: true }
}

export async function createTimeOff(
  input: CreateTimeOffInput
): Promise<{ error: string } | { success: true }> {
  const parsed = createTimeOffSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to add time off.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase.from('time_off').insert({
    organization_id: member.organization_id,
    scope: parsed.data.scope,
    name: parsed.data.name,
    all_day: parsed.data.allDay,
    starts_at: parsed.data.startsAt,
    ends_at: parsed.data.endsAt,
    reason: parsed.data.reason,
  })

  if (error) {
    return { error: 'Could not add time off. Please try again.' }
  }

  revalidatePath('/calendar')
  return { success: true }
}

export async function deleteTimeOff(
  id: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to delete time off.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase
    .from('time_off')
    .delete()
    .eq('id', id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not delete time off. Please try again.' }
  }

  revalidatePath('/calendar')
  return { success: true }
}
