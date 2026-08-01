'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  updateAgentGeneralSchema,
  updateAgentCallSettingsSchema,
  type UpdateAgentGeneralInput,
  type UpdateAgentCallSettingsInput,
} from '@/lib/validations/agent'

export async function updateAgentGeneral(
  agentId: string,
  input: Omit<UpdateAgentGeneralInput, 'agentId'>
): Promise<{ error: string } | { success: true }> {
  const parsed = updateAgentGeneralSchema.safeParse({ ...input, agentId })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update this receptionist.' }
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
    .from('agents')
    .update({
      voice_id: parsed.data.voiceId,
      language: parsed.data.defaultLanguage,
      additional_instructions: parsed.data.additionalInstructions,
      tone_traits: parsed.data.toneTraits,
      first_message: parsed.data.firstMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.agentId)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not update receptionist. Please try again.' }
  }

  revalidatePath(`/agents/${agentId}`)
  return { success: true }
}

export async function updateAgentCallSettings(
  agentId: string,
  input: Omit<UpdateAgentCallSettingsInput, 'agentId'>
): Promise<{ error: string } | { success: true }> {
  const parsed = updateAgentCallSettingsSchema.safeParse({ ...input, agentId })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update this receptionist.' }
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
    .from('agents')
    .update({
      answering_mode: parsed.data.answeringMode,
      staff_phone_number: parsed.data.staffPhoneNumber,
      max_ring_seconds: parsed.data.maxRingSeconds,
      hold_music: parsed.data.holdMusic,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.agentId)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not update call settings. Please try again.' }
  }

  revalidatePath(`/agents/${agentId}`)
  return { success: true }
}
