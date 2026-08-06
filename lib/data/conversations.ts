import { normalizeRecordingPath } from '@/lib/conversations/recording-path'
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
  isRead: boolean
  createdAt: string
  agentName: string | null
  roomName: string | null
  recordingPath: string | null
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
  'id, organization_id, agent_id, channel, outcome, category, summary, duration_seconds, ended_reason, transcript, call_goals, is_read, created_at, room_name, recording_path, agents(name)'

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
  is_read: boolean
  created_at: string
  room_name: string | null
  recording_path: string | null
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
    isRead: row.is_read ?? true,
    createdAt: row.created_at,
    agentName: agent?.name ?? null,
    roomName: row.room_name,
    recordingPath: row.recording_path,
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

export async function getConversationNavCounts(): Promise<{
  unreadConversations: number
  unreadMessages: number
}> {
  const empty = { unreadConversations: 0, unreadMessages: 0 }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return empty

    const { data: member } = await supabase
      .from('members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return empty

    const [conversationsResult, messagesResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', member.organization_id)
        .eq('is_read', false),
      supabase
        .from('caller_messages')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', member.organization_id)
        .eq('is_read', false),
    ])

    if (conversationsResult.error) {
      console.error('[conversations] unread conversation count failed:', conversationsResult.error)
    }
    if (messagesResult.error) {
      console.error('[conversations] unread message count failed:', messagesResult.error)
    }

    return {
      unreadConversations: conversationsResult.error ? 0 : conversationsResult.count ?? 0,
      unreadMessages: messagesResult.error ? 0 : messagesResult.count ?? 0,
    }
  } catch (error) {
    console.error('[conversations] nav counts failed:', error)
    return empty
  }
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

export async function getConversationRecordingUrl(conversationId: string): Promise<string | null> {
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
    .select('recording_path')
    .eq('id', conversationId)
    .eq('organization_id', member.organization_id)
    .single()

  if (!conversation?.recording_path) return null

  const storagePath = normalizeRecordingPath(conversation.recording_path)

  const { data: signed, error } = await supabase.storage
    .from('call-recordings')
    .createSignedUrl(storagePath, 3600)

  if (error || !signed) return null

  return signed.signedUrl
}
