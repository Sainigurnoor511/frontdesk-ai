import { z } from 'zod'

/** Mirrors the `urgency` check constraint in migration `046`. */
export const CALLER_MESSAGE_URGENCIES = ['low', 'normal', 'high'] as const
export type CallerMessageUrgency = (typeof CALLER_MESSAGE_URGENCIES)[number]

/** Mirrors the `source` check constraint in migration `046`. */
export const CALLER_MESSAGE_SOURCES = ['call_followup', 'agent_escalation'] as const
export type CallerMessageSource = (typeof CALLER_MESSAGE_SOURCES)[number]

/**
 * Minimum digits for something to be dialable at all. Deliberately permissive:
 * self-hosters are international, extensions and country codes vary, and the
 * number here is read back to a human who will dial it — not submitted to a
 * carrier API. Rejecting a valid foreign number would lose the message, which
 * is worse than storing one a person has to squint at.
 */
const CALLBACK_DIGITS_MIN = 7
const CALLBACK_DIGITS_MAX = 15

/** Digits only, for the length check and for what gets stored. */
export function countCallbackDigits(value: string): number {
  return value.replace(/\D/g, '').length
}

/**
 * Arguments for the `take_message` voice tool.
 *
 * Kept a bare `ZodObject` on purpose — no `.refine()`. `defineVoiceTool`,
 * `@livekit/agents`' `tool()`, and the AssemblyAI JSON-Schema conversion in
 * `lib/voice/providers/assemblyai/session-config.ts` all require an object
 * schema, and a `.refine()` would turn this into a `ZodEffects` that every one
 * of them rejects. Cross-field and normalization checks live at the top of the
 * handler's `execute`.
 *
 * There is deliberately no organization or conversation field: both come from
 * the server-resolved `VoiceToolContext`, so no model argument can select an
 * org. Every field is spoken by the caller and transcribed, hence the generous
 * upper bounds and the `.describe()` hints — the model reads those.
 */
export const takeMessageSchema = z.object({
  callerName: z
    .string()
    .trim()
    .min(1, 'Ask the caller for their name.')
    .max(120)
    .describe("The caller's full name, confirmed back to them before calling this tool"),
  callbackNumber: z
    .string()
    .trim()
    .min(CALLBACK_DIGITS_MIN)
    .max(40)
    .regex(
      /^[\d\s()+\-.]+$/,
      'A callback number can only contain digits, spaces, and the symbols + - . ( ).'
    )
    .describe('The phone number a human should call back on, in digits'),
  reason: z
    .string()
    .trim()
    .min(1, 'Summarize what the caller needs.')
    .max(2000)
    .describe('Why the caller wants a human: what they need, in your own words'),
  urgency: z
    .enum(CALLER_MESSAGE_URGENCIES)
    .default('normal')
    .describe(
      'How urgent the caller said it was. Use high only when they said it is urgent or an emergency; low when they said it can wait.'
    ),
  quotedLine: z
    .string()
    .trim()
    .max(500)
    .optional()
    .describe("Optional: the caller's own words, quoted, if one line captures the request"),
})

export type TakeMessageInput = z.infer<typeof takeMessageSchema>

/** Minimum/maximum dialable digit counts, exported for the handler's own check. */
export const CALLBACK_DIGIT_BOUNDS = {
  min: CALLBACK_DIGITS_MIN,
  max: CALLBACK_DIGITS_MAX,
} as const
