'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type UpdateClientInput,
} from '@/lib/validations/client'

export async function createClient(
  input: CreateClientInput
): Promise<{ error: string } | { success: true }> {
  const parsed = createClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to create a client.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase.from('clients').insert({
    organization_id: member.organization_id,
    name: parsed.data.name,
    phone_number: parsed.data.phoneNumber,
    email: parsed.data.email || null,
    notes: parsed.data.notes || null,
  })

  if (error) {
    return { error: 'Could not create client. Please try again.' }
  }

  revalidatePath('/clients')
  return { success: true }
}

export async function updateClient(
  input: UpdateClientInput
): Promise<{ error: string } | { success: true }> {
  const parsed = updateClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update a client.' }
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
    .from('clients')
    .update({
      name: parsed.data.name,
      phone_number: parsed.data.phoneNumber,
      email: parsed.data.email || null,
      notes: parsed.data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not update client. Please try again.' }
  }

  revalidatePath('/clients')
  return { success: true }
}

export async function deleteClient(
  id: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to delete a client.' }
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
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not delete client. Please try again.' }
  }

  revalidatePath('/clients')
  return { success: true }
}
