'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { runAssistant, type AssistantMessage } from '@/lib/assistant/run-assistant'

const assistantMessagesSchema = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(8000),
    })
  )
  .min(1)
  .max(60)

export type SendAssistantMessageResult =
  | { error: string }
  | { reply: string; toolsCalled: string[] }

export async function sendAssistantMessage(
  messages: AssistantMessage[]
): Promise<SendAssistantMessageResult> {
  const parsed = assistantMessagesSchema.safeParse(messages)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to use the assistant.' }
  }

  if (!process.env.GROQ_API_KEY) {
    return { error: 'The assistant is not configured. Set GROQ_API_KEY to enable it.' }
  }

  try {
    const { reply, toolsCalled } = await runAssistant(parsed.data)
    return { reply, toolsCalled }
  } catch {
    return { error: 'The assistant could not respond. Please try again.' }
  }
}
