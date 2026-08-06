import type { AgentDetail } from '@/lib/data/agents'

/**
 * Maps the agent's tone & personality traits to a Fish Audio S2 inline tag
 * (e.g. `['Friendly', 'Warm']` → `[friendly, warm]`). S2 interprets the tag as
 * natural-language delivery direction for everything that follows it, which is
 * exactly the "what kind of receptionist is this" expressiveness we want — the
 * LLM drives *what* is said, the tag drives *how* it sounds.
 */
export function buildToneTag(toneTraits: string[]): string | null {
  const traits = toneTraits.map((trait) => trait.trim().toLowerCase()).filter(Boolean)
  if (traits.length === 0) return null
  return `[${traits.join(', ')}]`
}

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
    agent.secure_mode
      ? 'Secure mode is enabled: only look up or edit client records when the caller ID matches the number on file, or after identity has been verified through the verification tool.'
      : null,
    agent.identity_verification_enabled
      ? 'Identity verification is available: you may send a one-time code by SMS or email to the contact on file and verify the caller before accessing or editing their client record.'
      : null,
    agent.allow_dtmf
      ? 'You may play DTMF touch tones during the call when needed to navigate phone menus or carrier prompts (for example, press 1 to accept a screened call). Use them only when the situation clearly requires keypad input.'
      : null,
    bookingGuidance,
  ].filter((part): part is string => Boolean(part))

  return parts.join('\n\n')
}

const bookingGuidance = `You have tools to check appointment availability and book appointments on the calendar. Use them whenever a caller asks to schedule, change, or check times — do not invent bookings or availability from memory.

When collecting the caller's name and email address, ask them to spell each one out letter-by-letter to avoid transcription errors, then read the spelled result back and confirm it with the caller before booking. Spell and repeat the caller's phone number the same way.

Before booking, confirm the exact date and time with the caller. If the requested time is unavailable, tell them the conflict and offer an alternative time, then retry the booking for that new time. Never override a slot that is reported as unavailable.`

