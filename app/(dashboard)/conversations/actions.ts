'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  messageIdSchema,
  createContactFromMessageSchema,
} from '@/lib/validations/conversation'

export async function markMessageAsRead(
  id: string
): Promise<{ error: string } | { success: true }> {
  const parsed = messageIdSchema.safeParse({ id })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update this message.' }
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
    .from('caller_messages')
    .update({ is_read: true })
    .eq('id', parsed.data.id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not update message. Please try again.' }
  }

  revalidatePath('/conversations')
  return { success: true }
}

export async function markAllMessagesAsRead(): Promise<
  { error: string } | { success: true }
> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update messages.' }
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
    .from('caller_messages')
    .update({ is_read: true })
    .eq('organization_id', member.organization_id)
    .eq('is_read', false)

  if (error) {
    return { error: 'Could not update messages. Please try again.' }
  }

  revalidatePath('/conversations')
  return { success: true }
}

export async function deleteMessage(
  id: string
): Promise<{ error: string } | { success: true }> {
  const parsed = messageIdSchema.safeParse({ id })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to delete this message.' }
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
    .from('caller_messages')
    .delete()
    .eq('id', parsed.data.id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not delete message. Please try again.' }
  }

  revalidatePath('/conversations')
  return { success: true }
}

export async function createContactFromMessage(
  messageId: string
): Promise<{ error: string } | { success: true }> {
  const parsed = createContactFromMessageSchema.safeParse({ messageId })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to create a contact.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { data: message } = await supabase
    .from('caller_messages')
    .select('id, caller_name, caller_phone')
    .eq('id', parsed.data.messageId)
    .eq('organization_id', member.organization_id)
    .single()

  if (!message) {
    return { error: 'Could not find that message.' }
  }

  if (!message.caller_name || !message.caller_phone) {
    return {
      error: 'This message is missing a name or phone number to create a contact.',
    }
  }

  const { data: client, error: insertError } = await supabase
    .from('clients')
    .insert({
      organization_id: member.organization_id,
      name: message.caller_name,
      phone_number: message.caller_phone,
      email: null,
      notes: null,
    })
    .select('id')
    .single()

  if (insertError || !client) {
    return { error: 'Could not create contact. Please try again.' }
  }

  const { error: updateError } = await supabase
    .from('caller_messages')
    .update({ converted_to_client_id: client.id, is_read: true })
    .eq('id', parsed.data.messageId)
    .eq('organization_id', member.organization_id)

  if (updateError) {
    return { error: 'Contact created, but could not update the message.' }
  }

  revalidatePath('/conversations')
  return { success: true }
}
