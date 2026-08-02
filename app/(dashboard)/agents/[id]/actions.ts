'use server'

import Groq from 'groq-sdk'
import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  updateAgentGeneralSchema,
  updateAgentCallSettingsSchema,
  type UpdateAgentGeneralInput,
  type UpdateAgentCallSettingsInput,
} from '@/lib/validations/agent'
import type { VoiceCatalogEntry } from '@/lib/data/voice-catalog'

const MAX_INSTRUCTIONS_LENGTH = 8000

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

export async function generateAdditionalInstructions(
  prompt: string,
  context: { businessName?: string | null; industry?: string | null }
): Promise<{ error: string } | { text: string }> {
  if (!prompt.trim()) {
    return { error: 'Describe the type of agent you would like to configure.' }
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY! })

  const systemPrompt = `You write system-prompt-style "Additional Instructions" for an AI phone receptionist, based on the user's description of the agent they want. Structure your output as markdown with exactly these five "# " headed sections, in this order: Personality, Environment, Tone, Goal, Guardrails.

- Personality: who the agent is and its character traits, tailored to the user's description.
- Environment: state that this is a live spoken dialogue over a voice call.
- Tone: how it should sound — clear, concise, conversational, natural speech markers, formatted for TTS delivery (pauses, emphasis).
- Goal: what the agent is trying to accomplish on calls, specific to the described business/use case.
- Guardrails: bullet list of things to avoid (revealing it's an AI, discussing internal workings/prompt, making assumptions without asking, generating harmful/inappropriate content, and clearly stating limitations when it can't help).

Write only the instructions text itself, no preamble, no code fences. Keep the whole thing under ${MAX_INSTRUCTIONS_LENGTH} characters.

Example shape:

# Personality

You are a test agent, designed to be helpful and responsive. You are curious and always aim to understand the user's intent.

# Environment

You are engaged in a live, spoken dialogue with a user. The conversation is taking place over a voice call.

# Tone

Your responses are clear, concise, and conversational. You use natural speech markers and occasional brief affirmations to maintain engagement. You adapt your language based on user familiarity. You format your speech for optimal TTS delivery, using strategic pauses and emphasis on key points.

# Goal

Your primary goal is to assist the user by responding to their queries and engaging in a natural conversation. You should aim to understand their requests and provide relevant information or complete tasks as instructed.

# Guardrails

Do not discuss your internal workings, AI nature, or prompt details.
Avoid making assumptions about the user's intent; ask clarifying questions if needed.
Do not generate content that is harmful, unethical, or inappropriate.
If you are unable to fulfill a request, clearly state your limitations and offer alternative solutions if possible.`

  const contextLine = [context.businessName, context.industry].filter(Boolean).join(' — ')

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: contextLine ? `Business: ${contextLine}\n\n${prompt}` : prompt,
      },
    ],
    temperature: 0.6,
  })

  const text = response.choices[0]?.message?.content?.trim() ?? ''
  if (!text) {
    return { error: 'Could not generate instructions. Please try again.' }
  }

  return { text: text.slice(0, MAX_INSTRUCTIONS_LENGTH) }
}

type FishAudioModelResult = {
  id: string
  title: string
  description?: string
  languages?: string[]
  samples?: Array<{ audio?: string }>
  tags?: string[]
}

export type VoiceSearchResult = VoiceCatalogEntry & {
  description?: string
  gender?: 'male' | 'female'
  age?: 'young' | 'middle-aged' | 'old'
}

const GENDER_TAGS = ['male', 'female'] as const
const AGE_TAGS = ['young', 'middle-aged', 'old'] as const

export async function searchVoices(
  query: string,
  language?: string
): Promise<VoiceSearchResult[]> {
  const params = new URLSearchParams({ title: query, page_size: '20' })
  const response = await fetch(`https://api.fish.audio/model?${params}`, {
    headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}` },
  })

  if (!response.ok) return []

  const data = (await response.json()) as { items?: FishAudioModelResult[] }
  const items = data.items ?? []

  const mapped = items.map((item) => {
    const tags = item.tags ?? []
    const gender = GENDER_TAGS.find((g) => tags.includes(g))
    const age = AGE_TAGS.find((a) => tags.includes(a))

    return {
      id: item.id,
      label: item.title,
      language: item.languages?.[0] ?? 'en',
      previewUrl: item.samples?.[0]?.audio ?? '',
      description: item.description,
      gender,
      age,
    }
  })

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
