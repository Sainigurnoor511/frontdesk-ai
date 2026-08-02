import Groq from 'groq-sdk'
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions'
import { buildGroqTools, executeTool } from './tools'

export type AssistantMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AssistantRunResult = {
  reply: string
  toolsCalled: string[]
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
 * Runs the tool-calling loop against Groq's OpenAI-compatible chat completions
 * API: ask the model, execute any tool calls it returns, feed the results back,
 * and repeat until it produces a plain text answer.
 */
export async function runAssistant(
  history: AssistantMessage[]
): Promise<AssistantRunResult> {
  const client = createClient()
  const model = process.env.GROQ_ASSISTANT_MODEL ?? DEFAULT_MODEL
  const tools = buildGroqTools()
  const toolsCalled: string[] = []

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ]

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
    })

    const choice = completion.choices[0]?.message
    if (!choice) {
      return { reply: 'Something went wrong talking to the assistant. Please try again.', toolsCalled }
    }

    const toolCalls = choice.tool_calls ?? []

    if (toolCalls.length === 0) {
      return { reply: choice.content?.trim() || 'Done.', toolsCalled }
    }

    messages.push(choice as ChatCompletionMessageParam)

    for (const toolCall of toolCalls) {
      const name = toolCall.function.name
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
        tool_call_id: toolCall.id,
        content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }),
      })
    }
  }

  return {
    reply:
      'I ran out of steps while working on that. Could you break the request into smaller parts?',
    toolsCalled,
  }
}
