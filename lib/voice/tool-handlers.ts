import { buildBookingToolHandlers } from './tools/booking-handlers'
import { buildManageBookingToolHandlers } from './tools/manage-booking-handlers'
import { buildKnowledgeToolHandlers } from './tools/knowledge-handlers'
import { buildEscalationToolHandlers } from './tools/escalation-handlers'
import type { VoiceToolContext, VoiceToolHandler } from './tools/types'

export type { VoiceToolContext, VoiceToolHandler }

/**
 * Whether this agent may look up, cancel, and move the caller's existing
 * appointments.
 *
 * The manage-booking tools authorize on organization + a caller-spoken email
 * address, which makes `find_appointment` an email-keyed read of appointment
 * titles and times and `cancel_appointment` / `reschedule_appointment` writes
 * behind the same single factor. An org that turned on secure mode or identity
 * verification asked for exactly that to stop, so the two flags withhold the
 * tools outright rather than asking the model to decline — a sentence in the
 * system prompt is guidance, not an access control, and the earlier version of
 * this feature had nothing else.
 *
 * Lifting the restriction needs a verification tool in this handler set (caller
 * ID on `conversations`, or an OTP flow); until one exists there is nothing for
 * a secure-mode agent to verify *with*, so "withhold" is the only honest
 * option. Backlogged in `developer-docs/TODO.md`.
 */
export function manageBookingToolsAllowed(context: VoiceToolContext): boolean {
  return !context.secureMode && !context.identityVerificationEnabled
}

/**
 * The full set of tools available on a call, honoring the agent's
 * `skip_knowledge_retrieval`, `secure_mode`, and
 * `identity_verification_enabled` settings.
 *
 * This is the provider-neutral composition point, and it is the *only* one:
 * the AssemblyAI path uses it to build `session.tools` and to dispatch
 * `tool.call` events, and the LiveKit worker reaches it through
 * `lib/voice/livekit-tools.ts`. Both providers therefore see the same list by
 * construction, including every gate above, which used to be expressed
 * separately in the worker. See `tools/types.ts` for the invariants every
 * handler upholds.
 */
export function buildVoiceToolHandlers(context: VoiceToolContext): VoiceToolHandler[] {
  const handlers = [...buildBookingToolHandlers(context)]
  if (manageBookingToolsAllowed(context)) {
    handlers.push(...buildManageBookingToolHandlers(context))
  }
  if (!context.skipKnowledgeRetrieval) {
    handlers.push(...buildKnowledgeToolHandlers(context))
  }
  // Last, and never gated. It is the fallback for every other tool failing or
  // being withheld, including on a secure-mode agent that has no manage-booking
  // tools at all — see `buildEscalationToolHandlers`.
  handlers.push(...buildEscalationToolHandlers(context))
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
