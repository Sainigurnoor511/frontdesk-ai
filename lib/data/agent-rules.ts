import { createClient } from '@/lib/supabase/server'

export type AgentRule = {
  id: string
  organization_id: string
  agent_id: string
  trigger: string
  action: string
  is_enabled: boolean
  position: number
  created_at: string
}

export async function getAgentRules(agentId: string): Promise<AgentRule[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agent_rules')
    .select('*')
    .eq('agent_id', agentId)
    .order('position', { ascending: true })

  return data ?? []
}
