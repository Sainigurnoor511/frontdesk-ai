import { buildBookingToolHandlers } from './tools/booking-handlers'
import { buildManageBookingToolHandlers } from './tools/manage-booking-handlers'
import { buildKnowledgeToolHandlers } from './tools/knowledge-handlers'
import type { VoiceToolContext, VoiceToolHandler } from './tools/types'

export type { VoiceToolContext, VoiceToolHandler }

/**
 * The full set of tools available on a call, honoring the agent's
 * `skip_knowledge_retrieval` setting.
 *
 * This is the provider-neutral composition point, and it is the *only* one:
 * the AssemblyAI path uses it to build `session.tools` and to dispatch
 * `tool.call` events, and the LiveKit worker reaches it through
 * `lib/voice/livekit-tools.ts`. Both providers therefore see the same list by
 * construction, including the `skip_knowledge_retrieval` gate, which used to be
 * expressed separately in the worker. See `tools/types.ts` for the invariants
 * every handler upholds.
 */
export function buildVoiceToolHandlers(context: VoiceToolContext): VoiceToolHandler[] {
  const handlers = [
    ...buildBookingToolHandlers(context),
    ...buildManageBookingToolHandlers(context),
  ]
  if (!context.skipKnowledgeRetrieval) {
    handlers.push(...buildKnowledgeToolHandlers(context))
  }
  return handlers
}

/**
 * Runs a tool by name, validating the model's raw arguments against the tool's
 * own Zod schema first. Mirrors `executeTool` in `lib/assistant/tools.ts`:
 * model-produced JSON never flows straight through into a data write.
 *
 * Unknown tools and validation failures come back in the same `{ error }` shape
 * the handlers themselves use, so every branch is something the agent can say
 * out loud instead of a dropped turn.
 */
export async function executeVoiceToolHandler(
  context: VoiceToolContext,
  name: string,
  rawArgs: unknown
): Promise<unknown> {
  const handler = buildVoiceToolHandlers(context).find((entry) => entry.name === name)
  if (!handler) {
    return { error: 'unknown_tool' }
  }

  const parsed = handler.parameters.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    return {
      error: 'invalid_arguments',
      // Naming the offending fields lets the agent re-ask for only what failed
      // instead of restarting the whole collection. AssemblyAI's tool docs are
      // explicit that vague errors send the model into guessing loops.
      details: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; '),
    }
  }

  return (handler.execute as (args: unknown) => Promise<unknown>)(parsed.data)
}
