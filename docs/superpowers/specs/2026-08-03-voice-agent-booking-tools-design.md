# Voice-Agent Booking Tool-Calling — Design

Date: 2026-08-03

## Overview

The voice agent (`workers/voice-agent.ts`) currently only converses (STT → LLM → TTS) — it cannot book appointments or create client records during a call, and no code path links a `conversations` row to the appointment/client it produced. This project gives the AI receptionist real tool-calling: check availability, book an appointment (creating/reusing a client by phone), and send a confirmation email — so live calls can actually complete a booking end-to-end, matching the reference "Reception.ai" confirmation-email example the user supplied.

Out of scope (tracked in `docs/superpowers/TODO.md`): a real business-hours/staff-aware slot-availability engine (this ships a simple appointment-overlap check only), and Google Calendar / external calendar sync (no OAuth infrastructure exists yet — tracked as existing Integrations item #1).

## Architecture

```
workers/voice-agent.ts entrypoint
        │
        │ new agents.Agent({
        │   instructions: buildSystemPrompt(agentDetail),   // extended: booking capability + spell-out instruction
        │   tools: buildBookingTools({ organizationId, agentId, conversationId }),
        │ })
        ▼
   AgentSession (existing Groq STT/LLM/TTS pipeline, unchanged)
        │  LLM decides to call a tool mid-conversation
        ▼
   lib/voice/booking-tools.ts
        ├─ check_availability(startsAt, endsAt)
        │     → lib/data/booking-service.ts: checkAvailabilityServiceRole()
        └─ book_appointment(title, clientName, clientEmail, clientPhone?, startsAt, endsAt, notes?)
              → lib/data/booking-service.ts:
                  1. checkAvailabilityServiceRole()  — hard block if conflict
                  2. findOrCreateClientServiceRole()  — dedup by phone within org
                  3. createAppointmentServiceRole()   — links client_id + conversation_id
              → lib/email/send-appointment-confirmation.ts (Resend)
```

## Service-role data layer (`lib/data/booking-service.ts`)

New file, mirrors the existing `agents-service.ts`/`conversations-service.ts` split (worker processes can't import `server-only`-tainted `lib/supabase/server.ts`, so these use `createServiceRoleClient()` and take `organizationId` as an explicit parameter rather than resolving it from a session):

- `checkAvailabilityServiceRole(organizationId, startsAt, endsAt): Promise<{ available: boolean; conflicts: AppointmentRow[] }>` — queries `appointments` for the org, `status != 'cancelled'`, and flags any row whose `[starts_at, ends_at)` overlaps the requested range. Simple overlap check only (no business-hours/staff/time-off awareness — see TODO).
- `findOrCreateClientServiceRole(organizationId, input: { name, phoneNumber, email }): Promise<{ id: string; isNew: boolean }>` — looks up an existing client by `phone_number` within the org first; if found, returns it (`isNew: false`) without overwriting existing fields. Otherwise inserts a new client row (`isNew: true`). This fixes a real gap: today's session-bound `createContactFromMessage` has no dedup at all, so callers re-booking would otherwise spawn duplicate client rows every call.
- `createAppointmentServiceRole(organizationId, agentId, conversationId, input): Promise<AppointmentRow>` — inserts into `appointments` with the new `client_id` and `conversation_id` FKs populated (see Data model changes), `status: 'confirmed'`.

## Tool definitions (`lib/voice/booking-tools.ts`)

Built with `@livekit/agents`' own `tool()` helper (from `node_modules/@livekit/agents/dist/llm/tool_context.d.ts` — `tool({ name, description, parameters, execute })`, Zod schemas accepted directly for `parameters`), **not** the local text-assistant `tool()` wrapper in `lib/assistant/tools.ts` (different runtime, different signature — that one is for the dashboard chat assistant's HTTP tool-calling loop).

`buildBookingTools({ organizationId, agentId, conversationId })` returns a `ToolDefinitionMap` closing over these three values from room metadata (already available in `workers/voice-agent.ts`'s entrypoint) — never LLM-supplied, so the model can't book into another org.

- **`check_availability`** — params `{ startsAt: string (ISO 8601 datetime), endsAt: string (ISO 8601 datetime) }`. Returns `{ available: true }` or `{ available: false, conflictingTitle: string }` for the model to relay ("that time's taken, want to try another?").
- **`book_appointment`** — params `{ title, clientName, clientEmail, clientPhone: optional, startsAt, endsAt, notes: optional }`. `clientEmail` is **required** (needed to send the confirmation email — this is new: today's dashboard `createClientSchema` has email optional, but the voice path requires it since email is the only confirmation channel available without Google Calendar sync). Behavior:
  1. Calls `checkAvailabilityServiceRole` — if conflict, returns `{ error: 'slot_unavailable', conflictingTitle }` immediately (hard block; tool never inserts an overlapping appointment). The LLM must ask for a different time and retry — it cannot override.
  2. Calls `findOrCreateClientServiceRole`.
  3. Calls `createAppointmentServiceRole`.
  4. Calls `sendAppointmentConfirmationEmail` (fire-and-forget style, but awaited with try/catch — email failure does **not** fail the booking; the appointment is already committed by this point). Logs failures, never throws into the tool result.
  5. Returns `{ success: true, appointmentId, isNewClient }` for the model to confirm back to the caller.
- Tool `execute` functions never throw — every failure path returns a structured `{ error: string }` (or the success shape above) matching what `AgentSession` expects to feed back into the LLM's next turn.

## Email confirmation (`lib/email/send-appointment-confirmation.ts`)

- New dependency: `resend` npm package.
- New env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (e.g. `"Closeloop <notifications@yourdomain.com>"` — placeholder until the user's Resend account has a verified sending domain; reading from env means no code change is needed once it's configured).
- `sendAppointmentConfirmationEmail({ to, clientName, businessName, startsAt, endsAt }): Promise<void>` — throws on failure (caller in `book_appointment`'s `execute` catches it), so this function itself stays simple/unconditional.
- Template matches the reference image structure: business wordmark-less plain header (this app has no "Reception.ai" branding to reuse — use the org's `business_name`), "Appointment reminder" → "Appointment confirmation" heading (this fires immediately on booking, not as a day-of reminder — reminder scheduling is separately out of scope), greeting with the client's name, a bordered info block (Business / Date / Time), a reschedule/cancel line, sign-off with business name. Plain HTML email (inline styles — no external CSS, per email-client constraints), no logo/branding assets needed since none exist for arbitrary orgs.

## Prompt changes (`lib/voice/agent-context.ts`)

`buildSystemPrompt` currently never mentions booking capability at all — tools would be invisible to the model without prompt guidance. Append (when tools are available, i.e. always for now since booking tools are unconditional):

- Explicit instruction that the agent can check availability and book appointments using the provided tools.
- **Spell-out instruction** (per user's explicit ask): when collecting the caller's name and email address, ask the caller to spell each out letter-by-letter to avoid transcription errors, and read the spelled result back for confirmation before calling `book_appointment` — mirrors the existing real call transcript example in this app's own data ("correcting a spelling error in the name") where this exact failure mode already happened.

## Data model changes (new migration)

- `appointments.client_id uuid references clients(id)` — nullable (existing rows and dashboard-created appointments that don't set it stay null).
- `appointments.conversation_id uuid references conversations(id)` — nullable. Feeds the future conversations-list "Appointment" accordion row (separate subproject).
- `clients.conversation_id uuid references conversations(id)` — nullable; non-null means this client was created *by* that conversation. The future conversations-list UI can render a "New" badge directly off this being non-null, no timestamp-heuristic needed.

## Error handling

- `check_availability`/`book_appointment` tool execute functions never throw into the LLM turn — every failure path (conflict, DB error, email error) returns a structured result the model can read and relay conversationally.
- Availability conflict is a hard block: `book_appointment` refuses to insert an overlapping appointment under any circumstance.
- Email send failure does not roll back or fail the appointment — the booking is already committed; email failure is logged server-side only, and the tool result still reports `success: true` (the caller got their slot; a missed confirmation email is a lesser failure than an unbooked appointment).

## Out of scope (see TODO.md)

- Real business-hours/staff/time-off-aware slot computation — this ships appointment-overlap-only conflict checking.
- Google Calendar (or any external calendar) sync/blocking — no OAuth infrastructure exists; tracked as existing Integrations TODO item #1.
- Appointment reminder emails (day-of/hour-before) — this only sends an immediate booking confirmation.
- Conversations-list UI (title/badges/accordion rows for appointments+clients) — separate subproject, depends on this one's new FKs.
