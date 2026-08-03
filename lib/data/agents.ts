import { createClient } from '@/lib/supabase/server'

export type Agent = {
  id: string
  organization_id: string
  name: string
  business_name: string | null
  industry: string | null
  country: string | null
  language: string | null
  staff_phone_number: string | null
  is_default: boolean
  voice_id: string | null
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
  'id, organization_id, name, business_name, industry, country, language, greeting_prompt, personality_notes, answering_mode, staff_phone_number, max_ring_seconds, hold_music, additional_instructions, first_message, tone_traits, voice_id, is_default, created_at, updated_at'

export async function getAgentsForOrg(organizationId: string): Promise<Agent[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agents')
    .select(
      'id, organization_id, name, business_name, industry, country, language, staff_phone_number, is_default, voice_id'
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export type PublicAgent = {
  id: string
  organizationId: string
  name: string
  businessName: string | null
}

/**
 * Used by the public booking page, where the caller is unauthenticated
 * (`anon` role). Selects only the columns the `anon` role is granted on
 * `agents` (see supabase/migrations/00000000000020_restrict_public_agents_columns.sql)
 * — a wider select here would be silently rejected by Postgres and return
 * no rows, per `getAgentsForOrg`'s error-swallowing `data ?? []` pattern.
 */
export async function getPublicAgentsForOrg(organizationId: string): Promise<PublicAgent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agents')
    .select('id, organization_id, name, business_name')
    .eq('organization_id', organizationId)
    // Order by a column the `anon` role is granted — Postgres checks
    // column-level SELECT privilege against every column a query
    // references, including ORDER BY, not just the output list.
    .order('name', { ascending: true })

  if (error) {
    console.error('getPublicAgentsForOrg failed:', error)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    businessName: row.business_name,
  }))
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
