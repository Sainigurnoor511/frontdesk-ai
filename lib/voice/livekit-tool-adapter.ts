import { tool } from '@livekit/agents'
import type { VoiceToolHandler } from './tools/types'

/**
 * Converts provider-neutral handlers into the shape `@livekit/agents`'
 * `AgentSession` wants: a plain object keyed by tool name, each value produced by
 * the framework's own `tool()` helper (which accepts Zod schemas directly).
 *
 * `lib/voice/booking-tools.test.ts` mocks `@livekit/agents`, and because Vitest
 * mocks apply across the whole module graph, importing `tool` here still resolves
 * to the mock.
 */
export function toLiveKitTools(handlers: VoiceToolHandler[]) {
  return Object.fromEntries(
    handlers.map((handler) => [
      handler.name,
      // `name` is deliberately omitted so this resolves to `tool()`'s anonymous
      // overload, which is what `AgentSession`'s tool map accepts — the record key
      // supplies the name. Passing `name` selects the named-tool overload and
      // yields a type `AgentSession` rejects.
      tool({
        description: handler.description,
        parameters: handler.parameters,
        execute: handler.execute,
      }),
    ])
  )
}
