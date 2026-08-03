# Web Call & Voice Pipeline — Design

Date: 2026-08-02

## Overview

FrontDesk.ai has no live call pipeline today — phone provisioning is a placeholder page, and Groq/Fish Audio are only used offline (website-scan extraction). This project builds the first real-time voice pipeline: an in-browser "web call" widget (dashboard test button + public booking-page embed) that connects a caller to the org's AI receptionist over LiveKit, using Groq for STT/LLM and a custom Fish Audio adapter for TTS. Phone/Twilio integration is out of scope (tracked separately in `docs/superpowers/TODO.md`'s Integrations section) — this pipeline is transport-agnostic at the LiveKit-room level, so wiring a SIP trunk in later reuses the same worker.

## Architecture

```
Browser (livekit-client)          Worker (workers/voice-agent.ts)
        │                                    │
        │ 1. request token (server action)   │
        ├───────────────────────────────────>│ resolves org agent config
        │ 2. join LiveKit room                │ 3. agent dispatched to same room
        ├─────────────┐          ┌───────────┤
        │             ▼          ▼            │
        │        LiveKit Room (Cloud)          │
        │             │          │             │
        │  mic audio ─┘          └─ agent audio│
        │                                       │
        │        Groq Whisper STT (VAD-chunked, via
        │        @livekit/agents-plugin-openai .withGroq())
        │                 │
        │        Groq LLM + tool calling
        │        (check availability, book appointment
        │         → existing server actions, service-role)
        │                 │
        │        Fish Audio TTS (custom adapter,
        │        lib/voice/adapters/fish-audio-tts.ts)
        │                                       │
        │ 4. on hangup/timeout: worker writes Conversation record
```

## Trigger points

- Home dashboard: wire up existing "Test it" button (`app/(dashboard)/home-client.tsx`, currently disabled/no-op).
- Sidebar: new call trigger (matches reference screenshot's popup).
- Public booking page: new `/book/[slug]` route (doesn't exist yet — `(dashboard)/booking-page` is only the authenticated settings/config screen). Requires a `slug` column on `organizations` (or `organization_settings`), generated from org name at creation/settings-save time, unique, URL-safe. Public page renders business info + services (reusing `getOrganizationSettings`/`getServices` shape already used by the settings page) plus the call widget.

All three open the same `CallDialog` component (orb, "Start a call or chat", "Or call <number>" fallback — hidden until phone numbers ship for real).

## Call lifecycle

1. Client requests a LiveKit token via server action, scoped to the org's agent (org resolved via `members` lookup for dashboard triggers; via public `agent_id`/org slug for booking-page triggers).
2. Server creates a LiveKit room (`org_id:call:<uuid>`), mints client token, dispatches `workers/voice-agent.ts` to join the same room. Loads agent config (system prompt, tools, business info, calendar) per design doc's Conversation Engine steps.
3. Worker joins as LiveKit agent participant. Pipeline: Groq Whisper STT (VAD-segmented utterances, `whisper-large-v3-turbo` via `openai.STT.withGroq()`) → Groq LLM with tool-calling (reusing existing booking/availability server actions, invoked with service-role client) → Fish Audio TTS (custom adapter) → streamed back through the room.
4. Client joins room via `livekit-client`, publishes mic, plays agent audio, drives the existing `Orb` component's `agentState` (`listening`/`talking`/`thinking`) from LiveKit speaking/audio-level events — the Orb's prop shape already anticipates this.
5. On hangup or max-duration timeout (5 min hard cap, enforced client-side and by worker), room closes. Worker writes a `Conversation` record (transcript, summary, duration, outcome) via a new `createConversation()` in `lib/data/conversations.ts`, using service-role client (worker runs standalone, cannot use session-scoped `lib/supabase/server.ts` per AGENTS.md's `server-only` split convention).

## Data model changes

- `lib/data/conversations.ts`: add `createConversation()` — no insert path exists today.
- `conversations` table: verify/extend RLS insert policy for service-role worker writes (existing policy in `supabase/migrations/00000000000009_conversations.sql` is user-session-shaped).
- Add lightweight in-progress tracking: `status` (`active`/`completed`/`failed`) + `started_at` columns on `conversations`, used for duration-cap enforcement — no separate `call_sessions` table needed.
- Public booking-page calls: caller identity fields nullable (anonymous caller).

## Adapters (`lib/voice/adapters/`)

- **STT**: `@livekit/agents-plugin-openai`'s `openai.STT.withGroq({ model: 'whisper-large-v3-turbo' })` — no custom code. Groq has no true streaming STT (confirmed against Groq docs); LiveKit's built-in VAD/turn-detection segments speech and calls Groq per-utterance.
- **LLM**: use the same OpenAI-compatible plugin's Groq path if it covers our tool-calling needs; only write a custom `groq-llm.ts` adapter if it doesn't.
- **TTS**: Fish Audio has no official LiveKit plugin — custom `fish-audio-tts.ts` implementing LiveKit's `tts.TTS` interface against Fish Audio's streaming API. This is the one adapter that must be hand-built.
- **Tools**: LLM function-calling tools wrap existing server actions (e.g. calendar booking), not new business logic — worker calls them with a service-role Supabase client.

## Public-path abuse protection

Booking-page calls are unauthenticated. Rate limit by IP using existing Redis (BullMQ instance) before minting a token — N calls/hour per IP. Hard cap call duration (5 min) enforced both client-side and by the worker (worker force-ends the room on timeout regardless of client behavior).

## Env vars

```
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
GROQ_API_KEY        # already exists
FISH_AUDIO_API_KEY
```
User will supply these directly; not provisioned by this project.

## Out of scope

- Real Twilio/phone number provisioning (`phone-numbers/page.tsx` stays a placeholder) — tracked separately in TODO.md.
- SIP trunk / inbound phone calls into the same pipeline — future work, same worker should be reusable once a SIP transport is added.
- CAPTCHA/Turnstile bot challenge on public booking-page calls — deferred; IP rate-limit + duration cap is the v1 bar.
- Full booking-page visual builder/customization (themes, layout options) — this build ships the minimum public page needed to host the call widget (business name/hours/services list + call button), not a polished booking-page product.

## Error handling

Per design doc: retry transient provider failures, fall back to graceful in-call error message (spoken via TTS if possible, otherwise client-side toast + call end), log diagnostics, isolate provider failures so swapping STT/LLM/TTS providers later doesn't require conversation-engine changes.
