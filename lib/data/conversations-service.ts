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
import type { Conversation, TranscriptMessage, CallGoal } from './conversations'

export type { Conversation, TranscriptMessage, CallGoal }

const CONVERSATION_COLUMNS =
  'id, organization_id, agent_id, channel, outcome, category, summary, duration_seconds, ended_reason, transcript, call_goals, created_at'

type ConversationRow = {
  id: string
  organization_id: string
  agent_id: string | null
  channel: 'voice_web' | 'phone' | 'chat'
  outcome: 'successful' | 'failed'
  category: string | null
  summary: string | null
  duration_seconds: number
  ended_reason: string | null
  transcript: TranscriptMessage[]
  call_goals: CallGoal[]
  created_at: string
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
    createdAt: row.created_at,
  }
}

export type CreateConversationInput = {
  organizationId: string
  agentId: string | null
  channel: 'voice_web' | 'phone' | 'chat'
  status: 'active'
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
    })
    .select(CONVERSATION_COLUMNS)
    .single()

  if (error || !data) {
    throw new Error(`Failed to create conversation: ${error?.message ?? 'unknown error'}`)
  }

  return mapConversation(data as ConversationRow)
}

export async function updateConversationStatus(
  id: string,
  patch: {
    status?: 'active' | 'completed' | 'failed'
    outcome?: 'successful' | 'failed'
    summary?: string
    durationSeconds?: number
    endedReason?: string
    transcript?: TranscriptMessage[]
  }
): Promise<void> {
  const supabase = createServiceRoleClient()
  const update: Record<string, unknown> = {}
  if (patch.status !== undefined) update.status = patch.status
  if (patch.outcome !== undefined) update.outcome = patch.outcome
  if (patch.summary !== undefined) update.summary = patch.summary
  if (patch.durationSeconds !== undefined) update.duration_seconds = patch.durationSeconds
  if (patch.endedReason !== undefined) update.ended_reason = patch.endedReason
  if (patch.transcript !== undefined) update.transcript = patch.transcript

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
}
