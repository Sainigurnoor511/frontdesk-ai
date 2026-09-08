import { z } from 'zod'

export const startDashboardCallSchema = z.object({
  agentId: z.string().uuid(),
})

export const startPublicCallSchema = z.object({
  organizationId: z.string().uuid(),
  agentId: z.string().uuid(),
  turnstileToken: z.string().optional(),
})

export const endCallSchema = z.object({
  roomName: z.string().min(1),
})

/**
 * Reports the AssemblyAI `session_id` the browser received in `session.ready`,
 * so the `session.completed` webhook can find this conversation later. The
 * session id is the only correlation key their webhook carries.
 *
 * The conversation id is checked against the caller's organization before the
 * link is written — see `linkAssemblyAiSession`.
 */
export const linkAssemblyAiSessionSchema = z.object({
  conversationId: z.string().uuid(),
  sessionId: z.string().min(1).max(200),
})

/**
 * A `tool.call` relayed from the browser during an AssemblyAI call.
 *
 * `arguments` is raw model output and is deliberately typed as an open record —
 * it gets validated against the individual tool's own Zod schema inside
 * `executeVoiceToolHandler`, never trusted as-is.
 */
export const executeVoiceToolSchema = z.object({
  conversationId: z.string().uuid(),
  toolName: z.string().min(1).max(100),
  arguments: z.record(z.unknown()).default({}),
})

/** Finalizes an AssemblyAI conversation when the caller hangs up. */
export const endAssemblyAiCallSchema = z.object({
  conversationId: z.string().uuid(),
  endedReason: z.string().max(100).optional(),
})

export type StartDashboardCallInput = z.infer<typeof startDashboardCallSchema>
export type StartPublicCallInput = z.infer<typeof startPublicCallSchema>
export type EndCallInput = z.infer<typeof endCallSchema>
export type LinkAssemblyAiSessionInput = z.infer<typeof linkAssemblyAiSessionSchema>
export type ExecuteVoiceToolInput = z.infer<typeof executeVoiceToolSchema>
export type EndAssemblyAiCallInput = z.infer<typeof endAssemblyAiCallSchema>
