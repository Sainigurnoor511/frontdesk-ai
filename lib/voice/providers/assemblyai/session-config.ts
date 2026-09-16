import { zodToJsonSchema } from 'zod-to-json-schema'
import { normalizeLanguageCode } from '@/lib/data/voice-catalog'
import type { AgentDetail } from '@/lib/data/agents'
import type { AgentRuleServiceRole } from '@/lib/data/agents-service'
import { buildDefaultFirstMessage, buildSystemPrompt } from '@/lib/voice/agent-context'
import type { VoiceToolHandler } from '@/lib/voice/tools/types'
import { isLanguageSupportedByAssemblyAi, resolveAssemblyAiVoice } from './voices'

/** AssemblyAI caps the transcription prompt at 1750 characters. */
const TRANSCRIPTION_PROMPT_MAX_CHARS = 1750

/** AssemblyAI accepts at most 100 keyterms. */
const KEYTERMS_MAX = 100

/**
 * Per-tool timeouts. The API default is 120s, which is unusable on a live call —
 * a hung dependency would leave the caller in silence for two minutes. On
 * timeout the agent apologizes and the session continues, so a short bound is
 * strictly better. Booking gets more room than the read-only tools because it
 * writes and then sends a confirmation email.
 */
const TOOL_TIMEOUT_SECONDS: Record<string, number> = {
  check_availability: 20,
  search_knowledge: 20,
  book_appointment: 30,
}

const DEFAULT_TOOL_TIMEOUT_SECONDS = 20

export type AssemblyAiTool = {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
  timeout_seconds: number
}

export type AssemblyAiSessionConfig = {
  system_prompt: string
  greeting: string
  input: {
    format: { encoding: 'audio/pcm' }
    keyterms?: string[]
    transcription_mode: 'min_latency' | 'balanced' | 'max_accuracy'
    transcription_prompt?: string
    language_codes?: string[]
    voice_focus?: 'near-field' | 'far-field'
    voice_focus_threshold?: number
    turn_detection: {
      vad_threshold: number
      min_silence: number
      max_silence: number
      interrupt_response: boolean
      interruption_delay: number
    }
  }
  output: {
    voice: string
    format: { encoding: 'audio/pcm' }
  }
  tools: AssemblyAiTool[]
}

/**
 * Converts a tool's Zod schema to the JSON Schema AssemblyAI expects.
 *
 * `$refStrategy: 'none'` inlines everything — a `$ref`/`$defs` structure is not
 * reliably understood by tool-calling models. `$schema` is dropped because it is
 * metadata the API doesn't want. Every voice tool schema is already an object,
 * so unlike `compileSchema` in `lib/assistant/tools.ts` there's no need for the
 * `{ value: ... }` wrapper fallback.
 */
function toJsonSchema(handler: VoiceToolHandler): Record<string, unknown> {
  const schema = zodToJsonSchema(handler.parameters, { $refStrategy: 'none' }) as Record<
    string,
    unknown
  >
  delete schema.$schema
  return schema
}

export function buildAssemblyAiTools(handlers: VoiceToolHandler[]): AssemblyAiTool[] {
  return handlers.map((handler) => ({
    type: 'function' as const,
    name: handler.name,
    description: handler.description,
    parameters: toJsonSchema(handler),
    timeout_seconds: TOOL_TIMEOUT_SECONDS[handler.name] ?? DEFAULT_TOOL_TIMEOUT_SECONDS,
  }))
}

/**
 * Bias terms for transcription. The business name matters most — it's spoken on
 * nearly every call, is often a proper noun, and is exactly what a general model
 * mistranscribes.
 */
function buildKeyterms(agent: AgentDetail): string[] {
  const terms = [agent.business_name, agent.name, agent.industry]
    .map((term) => term?.trim())
    .filter((term): term is string => Boolean(term))

  return Array.from(new Set(terms)).slice(0, KEYTERMS_MAX)
}

/**
 * Contextual prompt describing the audio, following AssemblyAI's guidance to
 * write plain sentences about the scenario rather than a keyword list (exact
 * terms belong in `keyterms`, which is set separately — the two are
 * complementary).
 */
function buildTranscriptionPrompt(agent: AgentDetail): string {
  const business = agent.business_name?.trim() || agent.name
  const industry = agent.industry?.trim()

  const prompt = [
    `Inbound call to the reception desk of ${business}${industry ? `, a ${industry} business` : ''}.`,
    'Callers ask about appointments, availability, opening hours, pricing, and services.',
    'They often spell out names, email addresses, and phone numbers letter by letter.',
  ].join(' ')

  return prompt.slice(0, TRANSCRIPTION_PROMPT_MAX_CHARS)
}

/**
 * Builds the inline `session.update` payload for an AssemblyAI-provider call.
 *
 * Inline rather than a stored agent (`POST /v1/agents` + `agent_id`) on purpose:
 * `agent_id` is mutually exclusive with the inline fields, and a stored agent
 * would need its own create/update sync on every settings change. Inline also
 * keeps per-call context — notably `conversationId`, which the booking tool
 * needs — resolvable server-side, which stored HTTP tools cannot do.
 *
 * Nothing secret goes in here: the agent's own LLM is AssemblyAI's managed
 * model, so there is no `llm.api_key`, and the function tools carry no
 * credentials. That's what makes it safe for the browser to send.
 */
export function buildAssemblyAiSessionConfig(options: {
  agent: AgentDetail
  rules: AgentRuleServiceRole[]
  tools: VoiceToolHandler[]
}): AssemblyAiSessionConfig {
  const { agent, rules, tools } = options

  const greeting = agent.first_message?.trim() || buildDefaultFirstMessage(agent)
  const languageCode = normalizeLanguageCode(agent.language ?? 'en')

  return {
    // Reused verbatim from the LiveKit path so a provider A/B compares engines,
    // not prompts. `buildSystemPrompt` is already provider-agnostic.
    system_prompt: buildSystemPrompt(agent, rules),
    greeting,
    input: {
      format: { encoding: 'audio/pcm' },
      keyterms: buildKeyterms(agent),
      transcription_mode: 'balanced',
      transcription_prompt: buildTranscriptionPrompt(agent),
      // Omitted when the agent has auto-detect on, which is what unlocks
      // Universal-3.5 Pro's native code-switching across its 18 input
      // languages. Pinning a single language would suppress that.
      ...(agent.detect_language || !isLanguageSupportedByAssemblyAi(languageCode)
        ? {}
        : { language_codes: [languageCode] }),
      // `voice_focus` is documented as defaulting to near-field, but the server
      // rejects a threshold without the parent field:
      //   invalid_value: 'input.voice_focus_threshold' requires 'input.voice_focus'
      //                  to be set (param=input.voice_focus)
      // So send both, or neither. Verified against the live API — omitting
      // `voice_focus` here fails the session before `session.ready`, which would
      // have broken every call for an agent with "filter background speech" on.
      //
      // near-field is correct for a browser mic (far-field is for a room mic);
      // the agent's setting only raises how aggressively the caller is isolated.
      ...(agent.filter_background_speech
        ? { voice_focus: 'near-field' as const, voice_focus_threshold: 0.95 }
        : {}),
      turn_detection: {
        vad_threshold: 0.5,
        // Seeded from the LiveKit session's endpointing window
        // (minDelay 300 / maxDelay 2500) so turn-taking feel is comparable
        // across providers. The wide upper bound suits a receptionist that has
        // callers spell out emails and phone numbers.
        min_silence: 300,
        max_silence: 2500,
        interrupt_response: true,
        // Approximates LiveKit's `interruption.minDuration: 400`.
        interruption_delay: 400,
      },
    },
    output: {
      voice: resolveAssemblyAiVoice(agent.voice_id, languageCode),
      format: { encoding: 'audio/pcm' },
    },
    tools: buildAssemblyAiTools(tools),
  }
}
