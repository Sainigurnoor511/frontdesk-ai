import type { AgentDetail } from '@/lib/data/agents'

/**
 * Builds the system prompt handed to the LLM for a voice session, from the
 * agent's configured persona fields. Field names match `AgentDetail` in
 * `lib/data/agents.ts` exactly (verified against that file, not guessed).
 */
export function buildSystemPrompt(agent: AgentDetail): string {
  const parts = [
    agent.greeting_prompt ?? `You are the AI receptionist for ${agent.business_name ?? agent.name}.`,
    agent.personality_notes ? `Personality: ${agent.personality_notes}` : null,
    agent.additional_instructions,
    agent.tone_traits.length > 0 ? `Tone: ${agent.tone_traits.join(', ')}` : null,
  ].filter((part): part is string => Boolean(part))

  return parts.join('\n\n')
}
