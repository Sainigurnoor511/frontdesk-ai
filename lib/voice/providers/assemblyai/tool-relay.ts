import { getAgentByIdCached } from '@/lib/data/agents-service'
import { getConversationOwnership } from '@/lib/data/conversations-service'
import { executeVoiceToolHandler } from '@/lib/voice/tool-handlers'

/**
 * Runs a tool the AssemblyAI agent asked for, relayed through the browser.
 *
 * On the LiveKit path tools execute inside the worker, which already holds the
 * org and conversation ids from the room metadata. AssemblyAI's managed pipeline
 * emits `tool.call` to whoever holds the WebSocket — the browser — so the call
 * has to come back through a server action to be executed with any authority.
 *
 * That makes this the security boundary for AssemblyAI-provider tool calls, and
 * it is deliberately strict:
 *
 *  - `organizationId` is resolved by the caller from the session (dashboard) or
 *    the public page's own org, never taken from the client payload.
 *  - The conversation must belong to that org. A caller can't drive tools
 *    against another tenant's conversation by guessing an id.
 *  - The conversation must still be `active`, so a finished call can't be
 *    replayed to book more appointments.
 *  - `organizationId`, `agentId`, and `conversationId` are then re-derived from
 *    the stored row and closed over by the handlers, so the model's arguments
 *    can never influence which tenant is written to.
 *
 * Returns a `{ error }` object on every failure path instead of throwing, so the
 * relay can always be turned into a `tool.result` the agent can speak.
 */
export async function runVoiceToolForConversation(options: {
  conversationId: string
  organizationId: string
  toolName: string
  arguments: Record<string, unknown>
}): Promise<unknown> {
  const { conversationId, organizationId, toolName } = options

  const conversation = await getConversationOwnership(conversationId)
  if (!conversation || conversation.organizationId !== organizationId) {
    return { error: 'conversation_not_found' }
  }

  if (conversation.status !== 'active') {
    return { error: 'call_already_ended' }
  }

  if (!conversation.agentId) {
    return { error: 'agent_not_found' }
  }

  const agent = await getAgentByIdCached(conversation.agentId)
  if (!agent || agent.organization_id !== organizationId) {
    return { error: 'agent_not_found' }
  }

  return executeVoiceToolHandler(
    {
      organizationId,
      agentId: agent.id,
      conversationId,
      skipKnowledgeRetrieval: agent.skip_knowledge_retrieval,
    },
    toolName,
    options.arguments
  )
}
