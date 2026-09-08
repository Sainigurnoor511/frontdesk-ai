import type { z } from 'zod'

/**
 * Provider-neutral shape for a voice tool.
 *
 * Both voice engines consume the same handlers:
 *
 *   - the LiveKit pipeline wraps each one in `@livekit/agents`' `tool()` helper
 *     (see `lib/voice/booking-tools.ts` / `lib/voice/knowledge-tools.ts`), and
 *   - the AssemblyAI Voice Agent path converts `parameters` to JSON Schema for
 *     `session.tools`, then runs `execute` from a server action when a
 *     `tool.call` event arrives.
 *
 * Defining the behavior once means a fix lands on both providers at the same
 * time and the two can't silently drift apart.
 *
 * Two invariants carried over from the original LiveKit implementation:
 *
 *  1. `organizationId`, `agentId`, and `conversationId` are closed over from
 *     server-resolved context, never accepted as model arguments — otherwise a
 *     prompt-injected caller could book into another org.
 *  2. `execute` never throws into the model's turn. Every failure path returns
 *     a structured `{ error: 'code' }` the agent can relay conversationally; a
 *     thrown error would abort the turn and leave the caller in silence.
 *
 * Nothing in this directory may import a `server-only`-tainted module (no
 * `lib/supabase/server`, no `next/headers`), because the standalone LiveKit
 * worker imports it — see the note atop `lib/data/agents-service.ts`.
 */
export type VoiceToolHandler = {
  name: string
  description: string
  /** Object schema. Also validates model-supplied arguments before `execute` runs. */
  parameters: z.ZodObject<z.ZodRawShape>
  /**
   * Erased argument type. Callers must validate raw arguments against
   * `parameters` first — `executeVoiceToolHandler` does this for the AssemblyAI
   * path, and `@livekit/agents` does it from the Zod schema on the LiveKit path.
   */
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

export type VoiceToolContext = {
  organizationId: string
  agentId: string
  conversationId: string
  /** Mirrors `agents.skip_knowledge_retrieval`; omits `search_knowledge` when true. */
  skipKnowledgeRetrieval?: boolean
}

/**
 * Preserves the inferred argument type inside `execute` while erasing it on the
 * returned entry, so a heterogeneous list of tools can share one type. Callers
 * re-validate raw arguments against `parameters` before invoking, which is what
 * makes the erasure safe at runtime.
 */
export function defineVoiceTool<TShape extends z.ZodRawShape>(definition: {
  name: string
  description: string
  parameters: z.ZodObject<TShape>
  execute: (args: z.infer<z.ZodObject<TShape>>) => Promise<unknown>
}): VoiceToolHandler {
  return definition as unknown as VoiceToolHandler
}
