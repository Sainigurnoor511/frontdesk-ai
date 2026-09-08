import { createConversation, updateConversationStatus } from '@/lib/data/conversations-service'
import { getEnabledAgentRulesServiceRole, type AgentDetail } from '@/lib/data/agents-service'
import { buildVoiceToolHandlers } from '@/lib/voice/tool-handlers'
import { MAX_CALL_SECONDS, type AssemblyAiCallSession } from '@/lib/voice/call-session'
import {
  ASSEMBLYAI_SAMPLE_RATE,
  ASSEMBLYAI_WS_URL,
  getAssemblyAiApiKey,
  mintVoiceAgentToken,
} from './client'
import { buildAssemblyAiSessionConfig } from './session-config'
import { isLanguageSupportedByAssemblyAi } from './voices'

/**
 * A temp token only needs to survive the round trip from the action's response to
 * the browser opening its WebSocket. Short by design — it's single-use, but a
 * tight window limits replay if a response is ever logged or cached.
 */
const TOKEN_EXPIRES_IN_SECONDS = 120

/**
 * Starts an AssemblyAI Voice Agent call: creates the conversation row, builds the
 * inline session configuration, and mints a browser token.
 *
 * Shared by the dashboard and public call paths so the two can't drift. The
 * caller is responsible for having already resolved `organizationId` from the
 * session (dashboard) or validated it against the public agent (SMB page) — this
 * function trusts what it's given and does not re-authorize.
 *
 * Unlike the LiveKit path there is no room to create and no worker to dispatch;
 * the browser talks to AssemblyAI directly. That also means there's nothing to
 * tear down server-side if the browser never connects, beyond the conversation
 * row this creates.
 */
export async function startAssemblyAiCall(options: {
  organizationId: string
  agent: AgentDetail
}): Promise<{ error: string } | AssemblyAiCallSession> {
  const { organizationId, agent } = options

  if (!getAssemblyAiApiKey()) {
    console.error('[assemblyai] ASSEMBLYAI_API_KEY is not configured; cannot start call')
    return { error: 'The AssemblyAI voice provider is not configured.' }
  }

  // Re-checked here and not just in the UI: an agent's language can change after
  // the provider was selected, which would otherwise strand it on a provider
  // that can understand the caller but cannot reply in their language.
  if (!isLanguageSupportedByAssemblyAi(agent.language)) {
    return {
      error:
        'AssemblyAI cannot speak this agent\u2019s language yet. Switch the agent to the LiveKit provider, or change its language to English, Spanish, German, French, Portuguese, or Italian.',
    }
  }

  const rules = await getEnabledAgentRulesServiceRole(agent.id)

  const conversation = await createConversation({
    organizationId,
    agentId: agent.id,
    channel: 'voice_web',
    status: 'active',
  })

  try {
    const sessionConfig = buildAssemblyAiSessionConfig({
      agent,
      rules,
      tools: buildVoiceToolHandlers({
        organizationId,
        agentId: agent.id,
        conversationId: conversation.id,
        skipKnowledgeRetrieval: agent.skip_knowledge_retrieval,
      }),
    })

    const token = await mintVoiceAgentToken({
      expiresInSeconds: TOKEN_EXPIRES_IN_SECONDS,
      // Without this the session inherits AssemblyAI's 3-hour maximum, so an
      // abandoned tab could bill for hours. Pinned to the app's own call cap.
      maxSessionDurationSeconds: MAX_CALL_SECONDS,
    })

    return {
      provider: 'assemblyai',
      token,
      wsUrl: ASSEMBLYAI_WS_URL,
      sampleRate: ASSEMBLYAI_SAMPLE_RATE,
      conversationId: conversation.id,
      session: sessionConfig,
      maxCallSeconds: MAX_CALL_SECONDS,
    }
  } catch (err) {
    console.error('[assemblyai] failed to start call:', err)
    try {
      await updateConversationStatus(conversation.id, {
        status: 'failed',
        outcome: 'failed',
        endedReason: 'assemblyai_start_failed',
      })
    } catch (updateErr) {
      console.error(`Failed to mark conversation ${conversation.id} as failed:`, updateErr)
    }
    return { error: 'Could not start the call. Please try again.' }
  }
}
