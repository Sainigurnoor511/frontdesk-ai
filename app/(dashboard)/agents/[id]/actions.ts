'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  updateAgentGeneralSchema,
  updateAgentCallSettingsSchema,
  type UpdateAgentGeneralInput,
  type UpdateAgentCallSettingsInput,
} from '@/lib/validations/agent'
import type { VoiceCatalogEntry } from '@/lib/data/voice-catalog'

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

type FishAudioModelResult = {
  id: string
  title: string
  languages?: string[]
  samples?: Array<{ audio?: string }>
}

export async function searchVoices(
  query: string,
  language?: string
): Promise<VoiceCatalogEntry[]> {
  const params = new URLSearchParams({ title: query, page_size: '20' })
  const response = await fetch(`https://api.fish.audio/model?${params}`, {
    headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}` },
  })

  if (!response.ok) return []

  const data = (await response.json()) as { items?: FishAudioModelResult[] }
  const items = data.items ?? []

  const mapped = items.map((item) => ({
    id: item.id,
    label: item.title,
    language: item.languages?.[0] ?? 'en',
    previewUrl: item.samples?.[0]?.audio ?? '',
  }))

  return language ? mapped.filter((voice) => voice.language === language) : mapped
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
