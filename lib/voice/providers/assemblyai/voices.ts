import { normalizeLanguageCode } from '@/lib/data/voice-catalog'

/**
 * AssemblyAI's voice set for the Voice Agent API.
 *
 * Voice ids are exact strings — an invented or misremembered one is rejected at
 * `session.update` with `invalid_value`, which kills the call before the caller
 * hears anything. Keep this list in sync with
 * https://www.assemblyai.com/docs/voice-agents/voice-agent-api/voices
 *
 * Deliberately unrelated to `lib/data/voice-catalog.ts`: those are Fish Audio
 * `reference_id`s used by the LiveKit pipeline, and the two providers share no
 * voice identifiers. Cloned voices from `custom_voices` have no equivalent here.
 */
export type AssemblyAiVoice = {
  id: string
  label: string
  /** Output language this voice has a primary or native accent in. */
  language: string
  accent: string
}

export const assemblyAiVoices: AssemblyAiVoice[] = [
  // English — American accent
  { id: 'alba', label: 'Alba', language: 'en', accent: 'American' },
  { id: 'eve', label: 'Eve', language: 'en', accent: 'American' },
  { id: 'george', label: 'George', language: 'en', accent: 'American' },
  { id: 'jane', label: 'Jane', language: 'en', accent: 'American' },
  { id: 'jean', label: 'Jean', language: 'en', accent: 'American' },
  { id: 'mary', label: 'Mary', language: 'en', accent: 'American' },
  { id: 'michael', label: 'Michael', language: 'en', accent: 'American' },
  // English — British accent
  { id: 'anna', label: 'Anna', language: 'en', accent: 'British' },
  { id: 'charles', label: 'Charles', language: 'en', accent: 'British' },
  { id: 'paul', label: 'Paul', language: 'en', accent: 'British' },
  { id: 'vera', label: 'Vera', language: 'en', accent: 'British' },
  // Native-accent voices for the other supported output languages. Each
  // code-switches naturally between its language and English.
  { id: 'lola', label: 'Lola', language: 'es', accent: 'Spanish' },
  { id: 'estelle', label: 'Estelle', language: 'fr', accent: 'French' },
  { id: 'juergen', label: 'Juergen', language: 'de', accent: 'German' },
  { id: 'rafael', label: 'Rafael', language: 'pt', accent: 'Portuguese' },
  { id: 'giovanni', label: 'Giovanni', language: 'it', accent: 'Italian' },
]

/**
 * Languages AssemblyAI can *speak*. This is the binding constraint on whether an
 * agent can run on this provider at all — recognition covers far more languages
 * than synthesis does, and an agent that understands the caller but can't reply
 * in their language is not a usable receptionist.
 *
 * Native-accent voices for Hindi, Turkish, Dutch, Swedish, Norwegian, Danish,
 * Finnish, Vietnamese, Arabic, Hebrew, Japanese, and Chinese are on AssemblyAI's
 * roadmap but not shipped.
 */
export const ASSEMBLYAI_OUTPUT_LANGUAGES = ['en', 'es', 'de', 'fr', 'pt', 'it'] as const

/**
 * Languages AssemblyAI can *recognize*, via Universal-3.5 Pro Streaming, with
 * native code-switching. Superset of the output languages.
 */
export const ASSEMBLYAI_INPUT_LANGUAGES = [
  'en', 'es', 'de', 'fr', 'pt', 'it', 'tr', 'nl', 'sv',
  'no', 'da', 'fi', 'hi', 'vi', 'ar', 'he', 'ja', 'zh',
] as const

/**
 * Whether an agent set to this language can run on AssemblyAI. Gates the
 * provider toggle in the UI and is re-checked server-side at call start, since a
 * language change could otherwise strand an agent on an unusable provider.
 */
export function isLanguageSupportedByAssemblyAi(language: string | null | undefined): boolean {
  const code = normalizeLanguageCode(language ?? 'en')
  return (ASSEMBLYAI_OUTPUT_LANGUAGES as readonly string[]).includes(code)
}

export function isLanguageRecognizedByAssemblyAi(language: string | null | undefined): boolean {
  const code = normalizeLanguageCode(language ?? 'en')
  return (ASSEMBLYAI_INPUT_LANGUAGES as readonly string[]).includes(code)
}

/** Voices with an accent matching the given language, for a language-scoped picker. */
export function assemblyAiVoicesForLanguage(language: string | null | undefined): AssemblyAiVoice[] {
  const code = normalizeLanguageCode(language ?? 'en')
  return assemblyAiVoices.filter((voice) => voice.language === code)
}

/**
 * Deterministic default voice for an agent's language. `voice` is required on
 * every session, and there is no "let the server pick" — so resolve a fixed one
 * rather than leaving it unset.
 */
export function defaultAssemblyAiVoiceForLanguage(language: string | null | undefined): string {
  const matching = assemblyAiVoicesForLanguage(language)
  if (matching.length > 0) return matching[0].id
  // Falls back to a British English voice, matching AssemblyAI's own default.
  return 'anna'
}

/**
 * Resolves the voice to speak with. `agents.voice_id` holds a Fish Audio
 * `reference_id` on the LiveKit path, which is meaningless here, so an id that
 * isn't in AssemblyAI's set is ignored in favor of the language default. That
 * makes flipping an existing agent onto this provider safe without a data
 * migration.
 */
export function resolveAssemblyAiVoice(
  voiceId: string | null | undefined,
  language: string | null | undefined
): string {
  const known = assemblyAiVoices.find((voice) => voice.id === voiceId)
  return known?.id ?? defaultAssemblyAiVoiceForLanguage(language)
}
