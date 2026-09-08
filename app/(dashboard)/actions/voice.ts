'use server'

import { AccessToken } from 'livekit-server-sdk'
import { createClient } from '@/lib/supabase/server'
import { getAgentById } from '@/lib/data/agents'
import {
  createConversation,
  getConversationAssemblyAiSessionId,
  getConversationOwnership,
  setConversationAssemblyAiSessionId,
  updateConversationStatus,
} from '@/lib/data/conversations-service'
import { endLiveKitCallRoom } from '@/lib/voice/end-call'
import { createLiveKitCallRoom } from '@/lib/voice/livekit-room'
import { MAX_CALL_SECONDS, type StartCallResult } from '@/lib/voice/call-session'
import { startAssemblyAiCall } from '@/lib/voice/providers/assemblyai/start-call'
import { enqueueAssemblyAiFinalize } from '@/lib/voice/providers/assemblyai/enqueue-finalize'
import { runVoiceToolForConversation } from '@/lib/voice/providers/assemblyai/tool-relay'
import {
  startDashboardCallSchema,
  endCallSchema,
  endAssemblyAiCallSchema,
  executeVoiceToolSchema,
  linkAssemblyAiSessionSchema,
  type StartDashboardCallInput,
  type EndCallInput,
  type EndAssemblyAiCallInput,
  type ExecuteVoiceToolInput,
  type LinkAssemblyAiSessionInput,
} from '@/lib/validations/voice'

/** Seconds before an empty room is auto-deleted by LiveKit (safety net). */
const ROOM_EMPTY_TIMEOUT_SECONDS = 30
/** Seconds after the last participant leaves before the room is considered empty. */
const ROOM_DEPARTURE_TIMEOUT_SECONDS = 5

/**
 * Resolves the caller's organization the canonical way: from the authenticated
 * user via the `members` table, never from a client-supplied id.
 */
async function resolveCallerOrganization(): Promise<
  { error: string } | { userId: string; organizationId: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to start a call.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  return { userId: user.id, organizationId: member.organization_id }
}

export async function startDashboardCall(
  input: StartDashboardCallInput
): Promise<StartCallResult> {
  const parsed = startDashboardCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const caller = await resolveCallerOrganization()
  if ('error' in caller) return caller

  // Read through the authenticated client so RLS scopes the agent to the
  // caller's org; the explicit comparison below is belt-and-braces.
  const agent = await getAgentById(parsed.data.agentId)
  if (!agent || agent.organization_id !== caller.organizationId) {
    return { error: 'Agent not found.' }
  }

  if (agent.voice_provider === 'assemblyai') {
    return startAssemblyAiCall({ organizationId: caller.organizationId, agent })
  }

  const roomName = `${caller.organizationId}:call:${crypto.randomUUID()}`
  const conversation = await createConversation({
    organizationId: caller.organizationId,
    agentId: parsed.data.agentId,
    channel: 'voice_web',
    status: 'active',
    roomName,
  })

  try {
    await createLiveKitCallRoom({
      roomName,
      agentId: parsed.data.agentId,
      conversationId: conversation.id,
      emptyTimeout: ROOM_EMPTY_TIMEOUT_SECONDS,
      departureTimeout: ROOM_DEPARTURE_TIMEOUT_SECONDS,
    })

    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: `dashboard-${caller.userId}`,
      ttl: MAX_CALL_SECONDS,
    })
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true })

    return {
      provider: 'livekit',
      token: await at.toJwt(),
      url: process.env.LIVEKIT_URL!,
      roomName,
      conversationId: conversation.id,
    }
  } catch (err) {
    console.error('Failed to create LiveKit room for dashboard call:', err)
    try {
      await updateConversationStatus(conversation.id, {
        status: 'failed',
        outcome: 'failed',
        endedReason: 'room_creation_failed',
      })
    } catch (updateErr) {
      console.error(`Failed to mark conversation ${conversation.id} as failed:`, updateErr)
    }
    return { error: 'Could not start the call. Please try again.' }
  }
}

export async function endDashboardCall(
  input: EndCallInput
): Promise<{ error: string } | { success: true }> {
  const parsed = endCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const caller = await resolveCallerOrganization()
  if ('error' in caller) return caller

  const expectedPrefix = `${caller.organizationId}:call:`
  if (!parsed.data.roomName.startsWith(expectedPrefix)) {
    return { error: 'Invalid call room.' }
  }

  await endLiveKitCallRoom(parsed.data.roomName)
  return { success: true }
}

/**
 * Records the AssemblyAI `session_id` the browser received in `session.ready`.
 *
 * The browser is the only party that learns this id, and it's the sole key
 * AssemblyAI's `session.completed` webhook carries, so the round trip is
 * unavoidable. The write is authorized against the caller's own organization and
 * refuses conversations that are already linked or already finished — see
 * `setConversationAssemblyAiSessionId`.
 */
export async function linkAssemblyAiSession(
  input: LinkAssemblyAiSessionInput
): Promise<{ error: string } | { success: true }> {
  const parsed = linkAssemblyAiSessionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const caller = await resolveCallerOrganization()
  if ('error' in caller) return caller

  const linked = await setConversationAssemblyAiSessionId(
    parsed.data.conversationId,
    parsed.data.sessionId,
    caller.organizationId
  )

  if (!linked) {
    return { error: 'Could not link the call session.' }
  }

  return { success: true }
}

/**
 * Executes a tool the AssemblyAI agent requested. See `runVoiceToolForConversation`
 * for why this has to round-trip through the server and what it enforces.
 */
export async function executeVoiceTool(
  input: ExecuteVoiceToolInput
): Promise<{ result: unknown }> {
  const parsed = executeVoiceToolSchema.safeParse(input)
  if (!parsed.success) {
    return { result: { error: 'invalid_request' } }
  }

  const caller = await resolveCallerOrganization()
  if ('error' in caller) {
    return { result: { error: 'not_authorized' } }
  }

  const result = await runVoiceToolForConversation({
    conversationId: parsed.data.conversationId,
    organizationId: caller.organizationId,
    toolName: parsed.data.toolName,
    arguments: parsed.data.arguments,
  })

  return { result }
}

/**
 * Called when the caller hangs up an AssemblyAI call.
 *
 * Deliberately does *not* set a terminal status. `updateConversationStatus` guards
 * terminal writes with `WHERE status = 'active'`, so finalizing here would make
 * the later transcript write a no-op. Instead the conversation stays `active` and
 * the queued job closes it out once AssemblyAI publishes the session artifacts.
 */
export async function endAssemblyAiCall(
  input: EndAssemblyAiCallInput
): Promise<{ error: string } | { success: true }> {
  const parsed = endAssemblyAiCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const caller = await resolveCallerOrganization()
  if ('error' in caller) return caller

  const conversation = await getConversationOwnership(parsed.data.conversationId)
  if (!conversation || conversation.organizationId !== caller.organizationId) {
    return { error: 'Conversation not found.' }
  }

  await finalizeAssemblyAiConversation(parsed.data.conversationId)
  return { success: true }
}

/**
 * Shared hangup bookkeeping for an AssemblyAI call. Looks up the linked session
 * and queues artifact retrieval; if the browser never reported a session id there
 * is nothing to fetch, so the conversation is failed outright rather than left
 * hanging as `active` forever.
 */
async function finalizeAssemblyAiConversation(conversationId: string): Promise<void> {
  const sessionId = await getConversationAssemblyAiSessionId(conversationId)

  if (!sessionId) {
    try {
      await updateConversationStatus(conversationId, {
        status: 'failed',
        outcome: 'failed',
        endedReason: 'assemblyai_session_never_started',
      })
    } catch (err) {
      console.error(`Failed to mark conversation ${conversationId} as failed:`, err)
    }
    return
  }

  await enqueueAssemblyAiFinalize({ conversationId, sessionId })
}
