import { createClient } from '@/lib/supabase/server'

export type Agent = {
  id: string
  name: string
  business_name: string | null
  industry: string | null
  country: string | null
  language: string | null
}

export async function getAgentsForOrg(organizationId: string): Promise<Agent[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agents')
    .select('id, name, business_name, industry, country, language')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function getAgentById(id: string): Promise<Agent | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agents')
    .select('id, name, business_name, industry, country, language')
    .eq('id', id)
    .single()

  return data
}
