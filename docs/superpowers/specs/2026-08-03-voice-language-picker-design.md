# Voice & language picker: constant per-call voice, real Fish Audio catalog

## Goal

Fix mid-call voice drift (Fish Audio TTS synthesizes with a different default
voice each request since no `reference_id` is ever sent) and replace the
Receptionist General tab's fake `VOICE_OPTIONS`/`LANGUAGE_OPTIONS` (3
hardcoded entries each) with a real Fish Audio-backed voice picker (search +
preview) and a 13-language list.

## Root cause being fixed

`lib/voice/adapters/fish-audio-tts.ts`'s `synthesizeSpeech` POSTs to
`/v1/tts` with no `reference_id` — Fish Audio picks an arbitrary voice per
request, so a single call can shift voice mid-sentence. `agents.voice_id`
already exists in the DB and form but is never read at the TTS call site.

## Scope

1. Voice catalog: curated shortlist per language + live search over Fish
   Audio's public Voice Library.
2. Language select: 13 languages, flag-in-circle per row.
3. Voice picker component: search, per-voice preview audio, orb avatar.
4. Wire `voice_id` through to the actual TTS request (the real bug fix).

## Data & storage

`lib/data/voice-catalog.ts` — hardcoded, same pattern as
`lib/data/integration-catalog.ts`:

```ts
type VoiceCatalogEntry = {
  id: string          // Fish Audio model _id, used directly as reference_id
  label: string
  language: string     // ISO code: en, es, fr, de, pt, zh, ja, hi, pa, ta, te, bn, mr
  previewUrl: string   // samples[0].audio from Fish Audio's public model, played as-is
}
```

~4-5 curated entries per language (~55-65 total), hand-picked once via Fish
Audio's `GET /model?title=...` search (ranked by `like_count`/`task_count`)
and copied into this file. No runtime API call for the shortlist itself.

Languages (13): English, Spanish, French, German, Portuguese, Chinese,
Japanese, Hindi, Punjabi, Tamil, Telugu, Bengali, Marathi.

## Server action

New `searchVoices(query: string, language?: string)` in
`app/(dashboard)/agents/[id]/actions.ts`:
- Calls `GET https://api.fish.audio/model?title=<query>&page_size=20` with
  `Authorization: Bearer ${FISH_AUDIO_API_KEY}` (server-side only, existing
  secret).
- Fish Audio's `language` query param does not reliably filter (verified:
  passing `language=hi` returned unrelated results) — filter client-side in
  the action against each result's own `languages[]` array instead.
- Returns `{ id, label: title, language, previewUrl: samples[0]?.audio }[]`,
  same shape as `VoiceCatalogEntry`.

## UI — Receptionist General tab

`app/(dashboard)/agents/[id]/agent-detail-client.tsx`:

- **Language select**: replaces hardcoded `LANGUAGE_OPTIONS` (3 items) with
  the 13-language list. Each row shows a circular flag avatar (emoji flag on
  a `rounded-full` background, matching the reference screenshot's
  circle-avatar style) + language name — no new icon dependency needed.
- **Voice select**: replaces the plain `Select` over fake `VOICE_OPTIONS`
  with a new `components/voice/voice-picker.tsx`, modeled on the
  ElevenLabs `ui.elevenlabs.io` Voice Picker pattern (`Command` + `Popover`,
  search-as-you-type, one shared audio player) but backed by our
  `VoiceCatalogEntry` data instead of `@elevenlabs/elevenlabs-js` — we don't
  use ElevenLabs elsewhere in this codebase, only Fish Audio.
  - Defaults to the curated shortlist for the currently-selected language.
  - Search box calls `searchVoices` for results beyond the shortlist.
  - Each row: existing `components/ui/orb.tsx` as a lightweight per-voice
    avatar (Fish voices have no headshot, only audio) + play/pause preview
    button.
  - One `<audio>` element shared across the picker so only one preview plays
    at a time (starting a second stops the first).
  - Selecting a voice sets `voiceId` exactly as today; persisted via the
    existing `updateAgentGeneral` action — no schema change, `voice_id`
    column already exists.

## Fix the actual bug

`lib/voice/adapters/fish-audio-tts.ts`:
- `synthesizeSpeech(text, voiceId?)` adds `reference_id: voiceId` to the
  POST body when provided.
- `FishAudioTTS` constructor takes an optional `voiceId`, passes it through
  on every `synthesize()` call so the same voice is pinned for the entire
  session.

`workers/voice-agent.ts`: constructs `new FishAudioTTS(agentDetail.voice_id ?? undefined)`
instead of `new FishAudioTTS()`.

## Testing

- `searchVoices`: unit test with mocked fetch — query param shaping, client-side
  language filter, non-200 error handling.
- `voice-picker.tsx`: search filters the list; selecting calls `onValueChange`;
  starting a second preview stops the first.
- `fish-audio-tts.test.ts`: update to assert `reference_id` is present in the
  request body when `voiceId` is passed, absent when it isn't.
- Manual: live call with a selected voice — confirm the same voice holds for
  the whole conversation (the original reported bug).

## Addendum: AI-generate + copy for Additional Instructions / First message

Additional Instructions footer bar (where the char counter sits) gets a wand
icon and a copy icon. Wand opens a small popover (not a modal) anchored to
the button — textarea placeholder "Describe the type of agent you would like
to configure...", circular up-arrow submit button, matches reference
screenshot. Submitting calls a new `generateAdditionalInstructions(prompt,
{businessName, industry})` server action (direct `groq-sdk` call, same
pattern as `lib/providers/llm/groq.ts`), which always **replaces** the
field's current content with the result, truncated defensively to 8000
chars. Copy icon copies current field text via `navigator.clipboard`. First
message field gets the same footer bar with just a copy button (no wand).

Testing: unit test for `generateAdditionalInstructions` (mocked Groq
response, truncation at 8000 chars). Copy/popover wiring verified manually
only — thin browser-API glue, consistent with the rest of this feature's UI
wiring tasks.
