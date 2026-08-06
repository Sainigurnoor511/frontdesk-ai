import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { runAssistantStream, type AssistantMessage } from '@/lib/assistant/run-assistant'
import { assistantMessageSchema } from '@/lib/validations/assistant'
import {
  addAssistantChatMessage,
  createAssistantChat,
  getAssistantChatMessages,
  titleFromFirstMessage,
} from '@/lib/data/assistant-chats'

const legacyMessagesSchema = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(8000),
    })
  )
  .min(1)
  .max(60)

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'You must be signed in to use the assistant.' }, { status: 401 })
  }

  if (!process.env.GROQ_API_KEY) {
    return Response.json(
      { error: 'The assistant is not configured. Set GROQ_API_KEY to enable it.' },
      { status: 503 }
    )
  }

  const parsedMessage = assistantMessageSchema.safeParse(body)
  let chatId: string | undefined
  let userMessage: string
  let history: AssistantMessage[]

  if (parsedMessage.success) {
    userMessage = parsedMessage.data.message.trim()
    chatId = parsedMessage.data.chatId

    if (chatId) {
      const { data: chat, error: chatError } = await supabase
        .from('assistant_chats')
        .select('id')
        .eq('id', chatId)
        .eq('user_id', user.id)
        .single()

      if (chatError || !chat) {
        return Response.json({ error: 'Chat not found.' }, { status: 404 })
      }

      const stored = await getAssistantChatMessages(chatId)
      history = stored.map((message) => ({ role: message.role, content: message.content }))
    } else {
      history = []
    }

    history.push({ role: 'user', content: userMessage })
  } else {
    const parsedLegacy = legacyMessagesSchema.safeParse(body)
    if (!parsedLegacy.success) {
      return Response.json({ error: parsedLegacy.error.issues[0].message }, { status: 400 })
    }

    history = parsedLegacy.data
    userMessage = history[history.length - 1]?.content ?? ''
    if (history[history.length - 1]?.role !== 'user') {
      return Response.json({ error: 'The last message must be from the user.' }, { status: 400 })
    }
  }

  if (!chatId) {
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (memberError || !member) {
      return Response.json({ error: 'Could not determine organization.' }, { status: 403 })
    }

    const chat = await createAssistantChat(
      member.organization_id,
      user.id,
      titleFromFirstMessage(userMessage)
    )
    chatId = chat.id
  }

  try {
    await addAssistantChatMessage(chatId, 'user', userMessage)
  } catch {
    return Response.json({ error: 'Could not save your message.' }, { status: 500 })
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      let assistantContent = ''

      try {
        await runAssistantStream(history, (chunk) => {
          assistantContent += chunk
          controller.enqueue(encoder.encode(chunk))
        })

        const trimmed = assistantContent.trim()
        if (trimmed) {
          await addAssistantChatMessage(chatId!, 'assistant', trimmed)
        }
      } catch {
        controller.enqueue(
          encoder.encode('\n\nThe assistant could not respond. Please try again.')
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Chat-Id': chatId,
    },
  })
}
