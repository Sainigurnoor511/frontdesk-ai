import Groq from 'groq-sdk'
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions'
import { buildGroqTools, executeTool } from './tools'

export type AssistantMessage = {
  role: 'user' | 'assistant'
  content: string
}

const DEFAULT_MODEL = 'openai/gpt-oss-120b'
const MAX_ITERATIONS = 6

const SYSTEM_PROMPT = `You are the in-app assistant for FrontDesk.ai, an AI receptionist platform for small businesses.

You do two things:
1. Explain how the product works — receptionists, the calendar, clients, staff, services, availability, the public booking page, integrations and settings.
2. Actually perform actions in the product on the user's behalf, using the tools you have been given. When a user asks you to do something the tools cover, do it rather than describing how they could do it themselves.

Rules:
- You act as the currently signed-in user, inside their own organization. Never ask for or invent an organization id or user id — the tools resolve that automatically.
- Many tools need ids (service id, client id, appointment id, message id). You cannot list records, so if you do not already have an id from the conversation, ask the user for it or tell them where to find it instead of guessing a UUID.
- Before calling any tool whose name starts with delete_, or cancel_appointment, confirm with the user first unless they have already been unambiguous about exactly what to remove.
- Several update tools replace the whole record. If the user is only changing one field, ask for the other current values rather than sending blanks that would wipe data.
- Convert relative dates and times ("tomorrow at 2", "next Friday") into absolute ISO 8601 datetimes before calling a tool. If it is ambiguous, ask.
- If a tool returns an error, say plainly what went wrong and what the user should do next. Do not retry the same call unchanged.
- Be concise. Short paragraphs, no headings, no filler. Confirm in one sentence what you did.`

function createClient(): Groq {
  return new Groq({ apiKey: process.env.GROQ_API_KEY! })
}

/**
 * Same tool-calling loop as runAssistant, but streams the final text answer
 * to onTextChunk as it arrives instead of returning it all at once. Tool-call
 * iterations are not streamed (there's no user-facing text to show yet) —
 * only the last, tool-free completion streams token by token.
 */
export async function runAssistantStream(
  history: AssistantMessage[],
  onTextChunk: (chunk: string) => void
): Promise<{ toolsCalled: string[] }> {
  const client = createClient()
  const model = process.env.GROQ_ASSISTANT_MODEL ?? DEFAULT_MODEL
  const tools = buildGroqTools()
  const toolsCalled: string[] = []

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ]

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const stream = await client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
      stream: true,
    })

    let content = ''
    const toolCallChunks: {
      id?: string
      function: { name?: string; arguments: string }
    }[] = []

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue

      if (delta.content) {
        content += delta.content
        onTextChunk(delta.content)
      }

      for (const toolCallDelta of delta.tool_calls ?? []) {
        const index = toolCallDelta.index
        const existing = toolCallChunks[index]
        if (!existing) {
          toolCallChunks[index] = {
            id: toolCallDelta.id,
            function: {
              name: toolCallDelta.function?.name,
              arguments: toolCallDelta.function?.arguments ?? '',
            },
          }
        } else {
          if (toolCallDelta.id) existing.id = toolCallDelta.id
          if (toolCallDelta.function?.name) existing.function.name = toolCallDelta.function.name
          if (toolCallDelta.function?.arguments) {
            existing.function.arguments += toolCallDelta.function.arguments
          }
        }
      }
    }

    if (toolCallChunks.length === 0) {
      if (!content.trim()) onTextChunk('Done.')
      return { toolsCalled }
    }

    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: toolCallChunks.map((toolCall, index) => ({
        id: toolCall.id ?? `call_${index}`,
        type: 'function' as const,
        function: {
          name: toolCall.function.name ?? '',
          arguments: toolCall.function.arguments,
        },
      })),
    })

    for (const toolCall of toolCallChunks) {
      const name = toolCall.function.name ?? ''
      toolsCalled.push(name)

      let parsedArgs: unknown = {}
      let parseError: string | null = null
      try {
        parsedArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}
      } catch {
        parseError = 'Tool arguments were not valid JSON. Try again with well-formed arguments.'
      }

      const outcome = parseError
        ? { ok: false as const, error: parseError }
        : await executeTool(name, parsedArgs)

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id ?? '',
        content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }),
      })
    }
  }

  onTextChunk(
    '\n\nI ran out of steps while working on that. Could you break the request into smaller parts?'
  )
  return { toolsCalled }
}
