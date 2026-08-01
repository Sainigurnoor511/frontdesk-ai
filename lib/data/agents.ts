import { createClient } from '@/lib/supabase/server'

export type Agent = {
  id: string
  name: string
  business_name: string | null
  industry: string | null
  country: string | null
  language: string | null
}

export type AgentDetail = Agent & {
  organization_id: string
  greeting_prompt: string | null
  personality_notes: string | null
  answering_mode: 'staff_first' | 'agent_first' | null
  staff_phone_number: string | null
  max_ring_seconds: number
  hold_music: string | null
  additional_instructions: string | null
  first_message: string | null
  tone_traits: string[]
  voice_id: string | null
  created_at: string
  updated_at: string
}

const AGENT_DETAIL_COLUMNS =
  'id, organization_id, name, business_name, industry, country, language, greeting_prompt, personality_notes, answering_mode, staff_phone_number, max_ring_seconds, hold_music, additional_instructions, first_message, tone_traits, voice_id, created_at, updated_at'

export async function getAgentsForOrg(organizationId: string): Promise<Agent[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agents')
    .select('id, name, business_name, industry, country, language')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function getAgentById(id: string): Promise<AgentDetail | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agents')
    .select(AGENT_DETAIL_COLUMNS)
    .eq('id', id)
    .single()

  return data
}
