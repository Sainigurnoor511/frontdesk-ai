import { createClient } from '@/lib/supabase/server'

export type PhoneNumber = {
  id: string
  organization_id: string
  agent_id: string | null
  number: string
  provider: 'twilio' | 'plivo' | 'sip-trunk'
  twilio_sid: string | null
  created_at: string
}

export type BlockedPhoneNumber = {
  id: string
  organization_id: string
  agent_id: string
  number: string
  created_at: string
}

export type OrgPhoneNumber = PhoneNumber & { agent_name: string | null }

export async function getPhoneNumbersForOrg(): Promise<OrgPhoneNumber[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return []

  const { data } = await supabase
    .from('phone_numbers')
    .select('*, agents(name)')
    .eq('organization_id', member.organization_id)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => {
    const { agents, ...phoneNumber } = row as PhoneNumber & { agents: { name: string } | null }
    return { ...phoneNumber, agent_name: agents?.name ?? null }
  })
}

export async function getAgentPhoneNumbers(agentId: string): Promise<PhoneNumber[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function getAgentBlockedNumbers(
  agentId: string
): Promise<BlockedPhoneNumber[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blocked_phone_numbers')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  return data ?? []
}
