import { createClient } from '@/lib/supabase/server'

export type AssistantChatSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type AssistantChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

function mapChat(row: {
  id: string
  title: string
  created_at: string
  updated_at: string
}): AssistantChatSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMessage(row: {
  id: string
  role: string
  content: string
  created_at: string
}): AssistantChatMessage {
  return {
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    createdAt: row.created_at,
  }
}

function isPostgrestMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST205'
}

export async function loadAssistantChatsForUser(userId: string): Promise<{
  chats: AssistantChatSummary[]
  tableMissing: boolean
}> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assistant_chats')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    if (isPostgrestMissingTable(error)) {
      return { chats: [], tableMissing: true }
    }
    throw error
  }
  return { chats: (data ?? []).map(mapChat), tableMissing: false }
}

export async function getAssistantChatsForUser(userId: string): Promise<AssistantChatSummary[]> {
  const { chats } = await loadAssistantChatsForUser(userId)
  return chats
}

export async function getAssistantChatMessages(chatId: string): Promise<AssistantChatMessage[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assistant_chat_messages')
    .select('id, role, content, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapMessage)
}

export function titleFromFirstMessage(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'New chat'
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed
}

export async function createAssistantChat(
  organizationId: string,
  userId: string,
  title: string
): Promise<AssistantChatSummary> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assistant_chats')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      title,
    })
    .select('id, title, created_at, updated_at')
    .single()

  if (error || !data) throw error ?? new Error('Failed to create assistant chat')
  return mapChat(data)
}

export async function addAssistantChatMessage(
  chatId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const supabase = await createClient()
  const { error: messageError } = await supabase.from('assistant_chat_messages').insert({
    chat_id: chatId,
    role,
    content,
  })

  if (messageError) throw messageError

  const { error: chatError } = await supabase
    .from('assistant_chats')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chatId)

  if (chatError) throw chatError
}

export async function deleteAssistantChat(chatId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('assistant_chats').delete().eq('id', chatId)
  if (error) throw error
}
