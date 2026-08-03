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
  'id, organization_id, name, business_name, industry, country, language, greeting_prompt, personality_notes, answering_mode, staff_phone_number, max_ring_seconds, hold_music, additional_instructions, first_message, tone_traits, voice_id, is_default, created_at, updated_at'

export async function getAgentByIdServiceRole(id: string): Promise<AgentDetail | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('agents')
    .select(AGENT_DETAIL_COLUMNS)
    .eq('id', id)
    .single()

  return data
}
