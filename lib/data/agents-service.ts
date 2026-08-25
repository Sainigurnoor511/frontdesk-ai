// Service-role read path for `agents`, safe to import from a standalone
// Node/worker process (no `next/headers`, no `server-only`-tainted imports).
//
// `lib/data/agents.ts` imports `createClient` from `lib/supabase/server.ts`,
// which itself imports the `server-only` package. That marker package throws at
// import time outside a bundler that understands the `react-server` export
// condition (e.g. a plain `tsx`/Node worker process) — so the whole
// `agents.ts` module is unsafe to import from a standalone worker.
// This file only imports `createServiceRoleClient` from `lib/supabase/service-role.ts`,
// which has no such taint, keeping it safe for both Next.js and worker contexts.
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AgentDetail } from './agents'

export type { AgentDetail }

const AGENT_DETAIL_COLUMNS =
  'id, organization_id, name, business_name, industry, country, language, detect_language, greeting_prompt, personality_notes, answering_mode, staff_phone_number, max_ring_seconds, hold_music, additional_instructions, first_message, tone_traits, voice_id, llm_model, reasoning_effort, filter_background_speech, skip_knowledge_retrieval, allow_dtmf, hold_sound, typing_sound_enabled, secure_mode, identity_verification_enabled, is_default, created_at, updated_at'

const AGENT_CACHE_TTL_MS = 60_000
const agentCache = new Map<string, { expiresAt: number; value: AgentDetail | null }>()

export async function getAgentByIdServiceRole(id: string): Promise<AgentDetail | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('agents')
    .select(AGENT_DETAIL_COLUMNS)
    .eq('id', id)
    .single()

  return data
}

/** Short-lived in-memory cache for hot voice-worker paths. */
export async function getAgentByIdCached(id: string): Promise<AgentDetail | null> {
  const now = Date.now()
  const cached = agentCache.get(id)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const value = await getAgentByIdServiceRole(id)
  agentCache.set(id, { expiresAt: now + AGENT_CACHE_TTL_MS, value })
  return value
}

export async function getAgentStaffPhoneServiceRole(agentId: string): Promise<string | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('agents')
    .select('staff_phone_number')
    .eq('id', agentId)
    .single()

  return data?.staff_phone_number ?? null
}

export type AgentRuleServiceRole = { trigger: string; action: string }

/** Enabled rules only, in display order — used to build the voice session's system prompt. */
export async function getEnabledAgentRulesServiceRole(
  agentId: string
): Promise<AgentRuleServiceRole[]> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('agent_rules')
    .select('trigger, action')
    .eq('agent_id', agentId)
    .eq('is_enabled', true)
    .order('position', { ascending: true })

  return data ?? []
}
