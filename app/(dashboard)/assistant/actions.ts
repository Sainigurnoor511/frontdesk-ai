'use server'

import { createClient } from '@/lib/supabase/server'
import { assistantChatIdSchema } from '@/lib/validations/assistant'
import {
  deleteAssistantChat,
  getAssistantChatMessages,
  getAssistantChatsForUser,
} from '@/lib/data/assistant-chats'

export async function listAssistantChats() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'You must be signed in.' as const }

  try {
    const chats = await getAssistantChatsForUser(user.id)
    return { chats }
  } catch {
    return { error: 'Could not load chat history.' as const }
  }
}

export async function loadAssistantChat(chatId: string) {
  const parsed = assistantChatIdSchema.safeParse({ chatId })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'You must be signed in.' as const }

  const { data: chat, error: chatError } = await supabase
    .from('assistant_chats')
    .select('id, title, created_at, updated_at')
    .eq('id', parsed.data.chatId)
    .eq('user_id', user.id)
    .single()

  if (chatError || !chat) {
    return { error: 'Chat not found.' as const }
  }

  try {
    const messages = await getAssistantChatMessages(parsed.data.chatId)
    return {
      chat: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.created_at,
        updatedAt: chat.updated_at,
      },
      messages,
    }
  } catch {
    return { error: 'Could not load messages.' as const }
  }
}

export async function removeAssistantChat(chatId: string) {
  const parsed = assistantChatIdSchema.safeParse({ chatId })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'You must be signed in.' as const }

  const { data: chat } = await supabase
    .from('assistant_chats')
    .select('id')
    .eq('id', parsed.data.chatId)
    .eq('user_id', user.id)
    .single()

  if (!chat) return { error: 'Chat not found.' as const }

  try {
    await deleteAssistantChat(parsed.data.chatId)
    return { success: true as const }
  } catch {
    return { error: 'Could not delete chat.' as const }
  }
}
