'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  reassignPhoneNumberSchema,
  type ReassignPhoneNumberInput,
} from '@/lib/validations/agent'

export async function reassignPhoneNumber(
  input: ReassignPhoneNumberInput
): Promise<{ error: string } | { success: true }> {
  const parsed = reassignPhoneNumberSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in to reassign a phone number.' }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: 'Could not determine organization.' }

  if (parsed.data.agentId) {
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('id', parsed.data.agentId)
      .eq('organization_id', member.organization_id)
      .maybeSingle()
    if (!agent) return { error: 'Receptionist not found.' }
  }

  const { error } = await supabase
    .from('phone_numbers')
    .update({ agent_id: parsed.data.agentId, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.phoneNumberId)
    .eq('organization_id', member.organization_id)

  if (error) return { error: 'Could not reassign the phone number. Please try again.' }

  revalidatePath('/phone-numbers')
  revalidatePath('/agents')
  return { success: true }
}
