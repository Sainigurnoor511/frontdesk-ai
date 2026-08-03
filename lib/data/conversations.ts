import { createClient } from '@/lib/supabase/server'

export type TranscriptMessage = {
  role: 'agent' | 'caller'
  text: string
  timestampSeconds: number
}

export type CallGoal = {
  name: string
  status: 'success' | 'failed' | 'unknown'
  reasoning: string
}

export type Conversation = {
  id: string
  organizationId: string
  agentId: string | null
  channel: 'voice_web' | 'phone' | 'chat'
  outcome: 'successful' | 'failed' | 'unknown'
  category: string | null
  summary: string | null
  durationSeconds: number
  endedReason: string | null
  transcript: TranscriptMessage[]
  callGoals: CallGoal[]
  createdAt: string
  agentName: string | null
}

export type CallerMessage = {
  id: string
  organizationId: string
  conversationId: string | null
  callerName: string | null
  callerPhone: string | null
  summary: string | null
  quotedLine: string | null
  isRead: boolean
  convertedToClientId: string | null
  createdAt: string
}

const CONVERSATION_COLUMNS =
  'id, organization_id, agent_id, channel, outcome, category, summary, duration_seconds, ended_reason, transcript, call_goals, created_at, agents(name)'

const CALLER_MESSAGE_COLUMNS =
  'id, organization_id, conversation_id, caller_name, caller_phone, summary, quoted_line, is_read, converted_to_client_id, created_at'

type ConversationRow = {
  id: string
  organization_id: string
  agent_id: string | null
  channel: 'voice_web' | 'phone' | 'chat'
  outcome: 'successful' | 'failed' | 'unknown'
  category: string | null
  summary: string | null
  duration_seconds: number
  ended_reason: string | null
  transcript: TranscriptMessage[]
  call_goals: CallGoal[]
  created_at: string
  agents: { name: string } | { name: string }[] | null
}

type CallerMessageRow = {
  id: string
  organization_id: string
  conversation_id: string | null
  caller_name: string | null
  caller_phone: string | null
  summary: string | null
  quoted_line: string | null
  is_read: boolean
  converted_to_client_id: string | null
  created_at: string
}

function mapConversation(row: ConversationRow): Conversation {
  const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentId: row.agent_id,
    channel: row.channel,
    outcome: row.outcome,
    category: row.category,
    summary: row.summary,
    durationSeconds: row.duration_seconds,
    endedReason: row.ended_reason,
    transcript: row.transcript ?? [],
    callGoals: row.call_goals ?? [],
    createdAt: row.created_at,
    agentName: agent?.name ?? null,
  }
}

function mapCallerMessage(row: CallerMessageRow): CallerMessage {
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    callerName: row.caller_name,
    callerPhone: row.caller_phone,
    summary: row.summary,
    quotedLine: row.quoted_line,
    isRead: row.is_read,
    convertedToClientId: row.converted_to_client_id,
    createdAt: row.created_at,
  }
}

export async function getConversationsForOrg(): Promise<Conversation[]> {
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

  const { data: conversations } = await supabase
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('organization_id', member.organization_id)
    .order('created_at', { ascending: false })

  if (!conversations) return []

  return (conversations as ConversationRow[]).map(mapConversation)
}

export async function getConversationById(
  id: string
): Promise<Conversation | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) return null

  const { data: conversation } = await supabase
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('id', id)
    .eq('organization_id', member.organization_id)
    .single()

  if (!conversation) return null

  return mapConversation(conversation as ConversationRow)
}

export async function getCallerMessagesForOrg(): Promise<CallerMessage[]> {
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

  const { data: messages } = await supabase
    .from('caller_messages')
    .select(CALLER_MESSAGE_COLUMNS)
    .eq('organization_id', member.organization_id)
    .order('created_at', { ascending: false })

  if (!messages) return []

  return (messages as CallerMessageRow[]).map(mapCallerMessage)
}
