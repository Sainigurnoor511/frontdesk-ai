import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { runAssistantStream, type AssistantMessage } from '@/lib/assistant/run-assistant'

const assistantMessagesSchema = z
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

  const parsed = assistantMessagesSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
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

  const messages: AssistantMessage[] = parsed.data

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        await runAssistantStream(messages, (chunk) => {
          controller.enqueue(encoder.encode(chunk))
        })
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
    },
  })
}
