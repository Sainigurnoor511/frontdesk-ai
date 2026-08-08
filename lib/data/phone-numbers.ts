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
