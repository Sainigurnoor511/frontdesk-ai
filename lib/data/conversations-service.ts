// Service-role write path for `conversations`, safe to import from a standalone
// Node/worker process (no `next/headers`, no `server-only`-tainted imports).
//
// `lib/data/conversations.ts` imports `createClient` from `lib/supabase/server.ts`,
// which itself imports the `server-only` package. That marker package throws at
// import time outside a bundler that understands the `react-server` export
// condition (e.g. a plain `tsx`/Node worker process) — so the whole
// `conversations.ts` module is unsafe to import from a standalone worker.
// This file only imports `createServiceRoleClient` from `lib/supabase/service-role.ts`,
// which has no such taint, keeping it safe for both Next.js and worker contexts.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { dispatchWebhook } from '@/lib/integrations/webhook'
import {
  buildCallerMessageContent,
  shouldCreateCallerMessage,
} from '@/lib/voice/caller-message-from-conversation'
import type { Conversation, TranscriptMessage, CallGoal } from './conversations'

export type { Conversation, TranscriptMessage, CallGoal }

const CONVERSATION_COLUMNS =
  'id, organization_id, agent_id, channel, outcome, category, summary, duration_seconds, ended_reason, transcript, call_goals, is_read, created_at, room_name, recording_path'

type ConversationRow = {
  id: string
  organization_id: string
  agent_id: string | null
  channel: 'voice_web' | 'phone' | 'chat'
  outcome: 'successful' | 'failed' | 'unknown'
  category: string | null
  summary: string | null
  duration_seconds: number
  ended_reason: string | null
  transcript: TranscriptMessage[]
  call_goals: CallGoal[]
  is_read: boolean
  created_at: string
  room_name: string | null
  recording_path: string | null
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentId: row.agent_id,
    channel: row.channel,
    outcome: row.outcome,
    category: row.category,
    summary: row.summary,
    durationSeconds: row.duration_seconds,
    endedReason: row.ended_reason,
    transcript: row.transcript ?? [],
    callGoals: row.call_goals ?? [],
    isRead: row.is_read,
    createdAt: row.created_at,
    agentName: null,
    roomName: row.room_name,
    recordingPath: row.recording_path,
  }
}

export type CreateConversationInput = {
  organizationId: string
  agentId: string | null
  channel: 'voice_web' | 'phone' | 'chat'
  status: 'active'
  roomName?: string
}

export async function createConversation(
  input: CreateConversationInput
): Promise<Conversation> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      organization_id: input.organizationId,
      agent_id: input.agentId,
      channel: input.channel,
      status: input.status,
      room_name: input.roomName ?? null,
    })
    .select(CONVERSATION_COLUMNS)
    .single()

  if (error || !data) {
    throw new Error(`Failed to create conversation: ${error?.message ?? 'unknown error'}`)
  }

  return mapConversation(data as ConversationRow)
}

export async function getConversationContextByRoomName(
  roomName: string
): Promise<{ conversationId: string; agentId: string } | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('conversations')
    .select('id, agent_id')
    .eq('room_name', roomName)
    .maybeSingle()

  if (error || !data?.agent_id) return null

  return {
    conversationId: data.id,
    agentId: data.agent_id,
  }
}

export async function updateConversationStatus(
  id: string,
  patch: {
    status?: 'active' | 'completed' | 'failed'
    outcome?: 'successful' | 'failed' | 'unknown'
    summary?: string
    durationSeconds?: number
    endedReason?: string
    transcript?: TranscriptMessage[]
    callGoals?: CallGoal[]
  },
  organizationId?: string
): Promise<void> {
  const supabase = createServiceRoleClient()
  const update: Record<string, unknown> = {}
  if (patch.status !== undefined) update.status = patch.status
  if (patch.outcome !== undefined) update.outcome = patch.outcome
  if (patch.summary !== undefined) update.summary = patch.summary
  if (patch.durationSeconds !== undefined) update.duration_seconds = patch.durationSeconds
  if (patch.endedReason !== undefined) update.ended_reason = patch.endedReason
  if (patch.transcript !== undefined) update.transcript = patch.transcript
  if (patch.callGoals !== undefined) update.call_goals = patch.callGoals

  if (organizationId && patch.status === 'completed') {
    void dispatchWebhook(organizationId, 'conversation.completed', {
      conversationId: id,
      summary: patch.summary ?? null,
      durationSeconds: patch.durationSeconds ?? null,
      endedReason: patch.endedReason ?? null,
      transcript: patch.transcript ?? [],
    })
  }

  // When transitioning out of 'active' (the terminal-state writes made by the
  // voice worker), guard the write with `WHERE status = 'active'` so a stale
  // update (e.g. from a crashed-and-restarted worker racing a fresher one)
  // can't clobber a status another writer already finalized. Non-terminal
  // patches (status omitted or explicitly 'active') are unaffected.
  let query = supabase.from('conversations').update(update).eq('id', id)
  if (patch.status === 'completed' || patch.status === 'failed') {
    query = query.eq('status', 'active')
  }

  const { error } = await query
  if (error) {
    throw new Error(`Failed to update conversation ${id}: ${error.message}`)
  }

  if (
    organizationId &&
    (patch.status === 'completed' || patch.status === 'failed') &&
    patch.outcome &&
    shouldCreateCallerMessage(patch.outcome, patch.callGoals ?? [])
  ) {
    const { data: existing } = await supabase
      .from('caller_messages')
      .select('id')
      .eq('conversation_id', id)
      .maybeSingle()

    if (!existing) {
      const { summary, quotedLine } = buildCallerMessageContent(
        patch.summary,
        patch.transcript ?? [],
        patch.callGoals ?? []
      )

      const { error: messageError } = await supabase.from('caller_messages').insert({
        organization_id: organizationId,
        conversation_id: id,
        summary,
        quoted_line: quotedLine,
        is_read: false,
      })

      if (messageError) {
        console.error(
          `[conversations-service] failed to create caller message for conversation ${id}:`,
          messageError.message
        )
      }
    }
  }
}

/**
 * Records the AssemblyAI session id for a conversation, so the
 * `session.completed` webhook can find it later — that id is the only
 * correlation key the delivery carries.
 *
 * The browser is what learns the session id (it arrives in `session.ready`), so
 * this write is gated on `organization_id` *and* on the conversation still being
 * active and unlinked. That prevents a caller from attaching an arbitrary session
 * to a conversation, or re-pointing one that already has a session. The unique
 * index from migration 044 blocks the remaining case: two conversations claiming
 * the same session.
 *
 * Returns false when nothing matched, rather than throwing — a losing race here
 * is not an error worth failing the call over.
 */
export async function setConversationAssemblyAiSessionId(
  conversationId: string,
  sessionId: string,
  organizationId: string
): Promise<boolean> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('conversations')
    .update({ assemblyai_session_id: sessionId })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .is('assemblyai_session_id', null)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error(
      `[conversations-service] failed to link AssemblyAI session ${sessionId} to conversation ${conversationId}:`,
      error.message
    )
    return false
  }

  return Boolean(data)
}

export type AssemblyAiConversationContext = {
  conversationId: string
  organizationId: string
  agentId: string | null
  startedAt: string | null
  status: string
}

/** Resolves the conversation an AssemblyAI webhook delivery refers to. */
export async function getConversationByAssemblyAiSessionId(
  sessionId: string
): Promise<AssemblyAiConversationContext | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('conversations')
    .select('id, organization_id, agent_id, started_at, status')
    .eq('assemblyai_session_id', sessionId)
    .maybeSingle()

  if (error || !data) return null

  return {
    conversationId: data.id,
    organizationId: data.organization_id,
    agentId: data.agent_id,
    startedAt: data.started_at,
    status: data.status,
  }
}

/**
 * Points a conversation at its stored recording object key inside
 * `call-recordings`. Separate from `updateConversationStatus` because the
 * recording arrives on its own schedule — LiveKit delivers it via the
 * `egress_ended` webhook, AssemblyAI via its session artifacts — and in both
 * cases that can land after the conversation has already been finalized.
 */
export async function setConversationRecordingPath(
  conversationId: string,
  recordingPath: string
): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('conversations')
    .update({ recording_path: recordingPath })
    .eq('id', conversationId)

  if (error) {
    console.error(
      `[conversations-service] failed to write recording_path for conversation ${conversationId}:`,
      error.message
    )
  }
}

export type ConversationOwnership = {
  conversationId: string
  organizationId: string
  agentId: string | null
  status: string
}

/**
 * Minimal ownership lookup used to authorize a mid-call tool invocation relayed
 * from the browser. Callers must compare `organizationId` against an org they
 * resolved themselves (from the session, or from the public page's own org) —
 * never against one supplied by the client.
 */
export async function getConversationOwnership(
  conversationId: string
): Promise<ConversationOwnership | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('conversations')
    .select('id, organization_id, agent_id, status')
    .eq('id', conversationId)
    .maybeSingle()

  if (error || !data) return null

  return {
    conversationId: data.id,
    organizationId: data.organization_id,
    agentId: data.agent_id,
    status: data.status,
  }
}

/** The AssemblyAI session linked to a conversation, if the browser reported one. */
export async function getConversationAssemblyAiSessionId(
  conversationId: string
): Promise<string | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('conversations')
    .select('assemblyai_session_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (error || !data) return null
  return data.assemblyai_session_id ?? null
}
