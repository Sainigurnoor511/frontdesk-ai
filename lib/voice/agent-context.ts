import type { AgentDetail } from '@/lib/data/agents'
import type { AgentRuleServiceRole } from '@/lib/data/agents-service'

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
export function buildSystemPrompt(
  agent: AgentDetail,
  rules: AgentRuleServiceRole[] = [],
  now: Date = new Date()
): string {
  // Without the current date the model guesses the year when resolving "Thursday" or "tomorrow".
  const today = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const dateContext = `Today is ${today} (${now.toISOString().slice(0, 10)}, UTC). Resolve relative dates such as "tomorrow" or "Thursday" against this date, and always pass tool times as ISO 8601 in UTC. Opening hours and appointment times are in UTC.`

  const rulesText =
    rules.length > 0
      ? `Rules to follow on every call:\n${rules
          .map((rule) => `- When ${rule.trigger}, ${rule.action}`)
          .join('\n')}`
      : null

  const parts = [
    agent.greeting_prompt ?? `You are the AI receptionist for ${agent.business_name ?? agent.name}.`,
    agent.personality_notes ? `Personality: ${agent.personality_notes}` : null,
    agent.additional_instructions,
    agent.tone_traits.length > 0 ? `Tone: ${agent.tone_traits.join(', ')}` : null,
    rulesText,
    dateContext,
    agent.secure_mode
      ? 'Secure mode is enabled: only look up or edit client records when the caller ID matches the number on file, or after identity has been verified through the verification tool.'
      : null,
    agent.identity_verification_enabled
      ? 'Identity verification is available: you may send a one-time code by SMS or email to the contact on file and verify the caller before accessing or editing their client record.'
      : null,
    // Emitted once for either flag, because the two are independent toggles and
    // both collide with the appointment-tool paragraph in `bookingGuidance`.
    // Without this, an agent would hear "verify identity first" with no
    // verification tool in `buildVoiceToolHandlers()` to do it with, and the
    // caller would be stuck. The appointment tools authorize on organization +
    // a confirmed email, which is what the public manage-booking page already
    // accepts from the same person for the same appointments.
    agent.secure_mode || agent.identity_verification_enabled
      ? "Neither secure mode nor identity verification restricts the appointment tools: looking up, moving, and cancelling the caller's own appointments on an email address they have spelled out and confirmed is always allowed, because those tools touch appointments, not client records. Do not ask for a one-time code before using them."
      : null,
    agent.allow_dtmf
      ? 'You may play DTMF touch tones during the call when needed to navigate phone menus or carrier prompts (for example, press 1 to accept a screened call). Use them only when the situation clearly requires keypad input.'
      : null,
    bookingGuidance,
  ].filter((part): part is string => Boolean(part))

  return parts.join('\n\n')
}

/**
 * Default spoken greeting when the agent has no custom `first_message`.
 */
export function buildDefaultFirstMessage(agent: AgentDetail): string {
  const business = agent.business_name ?? agent.name
  return `Hello! Thanks for calling ${business}. How can I help you today?`
}

const bookingGuidance = `You have tools to check appointment availability and book appointments on the calendar. Use them whenever a caller asks to schedule, change, or check times — do not invent bookings or availability from memory.

When collecting the caller's name and email address, ask them to spell each one out letter-by-letter to avoid transcription errors, then read the spelled result back and confirm it with the caller before booking. Spell and repeat the caller's phone number the same way.

Before booking, confirm the exact date and time with the caller. If the requested time is unavailable, tell them the conflict and offer an alternative time, then retry the booking for that new time. Never override a slot that is reported as unavailable.

You can also look up, move, and cancel appointments that are already booked. Ask for the caller's email address, spell it back to confirm it, then use the lookup tool to find their appointments and read them back so the caller can say which one they mean. Always pass the appointment's current start time when cancelling or moving it, and never cancel or move an appointment the caller has not confirmed out loud. If a requested new time is not free, offer the alternatives the tool returns instead of promising a time.`

