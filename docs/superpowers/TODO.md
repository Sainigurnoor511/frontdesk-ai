# Deferred Work

Items raised during development that are out of scope for the current phase but should be picked up later. Add a dated entry when something is deferred; remove it once done (and note where it landed).

---

## Design Document Status (audited 2026-08-06)

Cross-reference: `docs/FrontDesk.ai_Design_Document_Page_1.md` (vision), `Page_2_Backend.md`, `Page_3_AI_Voice.md`, `Page_4_Claude_Code_Guide.md`, `Page_5_UI_UX_Updated.md`.

### ✅ Built (core v1 in place)

| Area | What exists |
|------|-------------|
| **Auth & orgs** | Supabase auth (email + Google OAuth), auto-org on signup, RLS on all tenant tables, onboarding flow |
| **Dashboard shell** | shadcn Sidebar, header (Assistant / Help / Notifications / avatar), Home, Guides, Settings |
| **AI agents** | CRUD, general instructions, first message, tone traits, voices tab (Fish Audio catalog + custom voices + design), call settings |
| **Web voice calls** | LiveKit room + worker (`workers/voice-agent.ts`), Groq STT/LLM, Fish Audio TTS, dashboard + public call widgets |
| **Booking tools (voice)** | `check_availability` + `book_appointment` wired to availability engine |
| **Calendar** | Week/day/month views, create/edit/cancel, click slot to create, staff filter, time off |
| **Availability** | Business hours, exceptions, staff hours, slot engine (`lib/data/availability-engine.ts`) |
| **Public booking** | `/smb/[slug]` — multi-step flow (service → staff → date → time → confirm), manage/reschedule/cancel, booking page builder |
| **CRM / clients** | Client CRUD, auto-create on booking, convert caller messages to contacts |
| **Staff** | Staff directory CRUD, booking-page visibility |
| **Business profile** | Name, locations, services/assets/products, hours link |
| **Conversations** | List + detail UI, live transcript during calls, **persisted transcript + Groq summary** after web calls, **call recordings** (LiveKit egress → Supabase Storage + playback in detail sheet) |
| **Analytics** | Overview/calls/services/clients/conversion tabs, channel filter, day/week granularity, service/staff booking counts, revenue from linked service prices |
| **Integrations** | Webhook tool (real: config UI, HMAC signing, BullMQ delivery worker) |
| **Workers** | `scan-website`, `webhook`, `voice-agent` (LiveKit CLI, not BullMQ) |
| **Email** | Appointment confirmation emails (Resend) on voice + public booking |
| **Settings** | Account (language, password reset email), notification prefs, feature flags in DB |
| **Docker** | `docker-compose.yml` + nginx for self-hosting |
| **Website scan** | Onboarding crawler + BullMQ worker → prefills agent creation |

### ⚠️ Partially built

| Area | Done | Still missing |
|------|------|---------------|
| **Knowledge base / RAG** | Website crawl + file upload + FAQ editor, pgvector indexing, `search_knowledge` voice tool | PDF/DOCX upload; auto-capture unanswered questions from conversations |
| **Conversations** | Schema + UI, persisted transcript + summary, call recordings + playback | `phone`/`chat` channels unused |
| **Google Calendar** | Catalog entry marked “Available”, enable/disable toggle | **No OAuth flow, no token storage, no calendar sync** — `configureGoogleCalendarSchema` unused |
| **Phone / telephony** | Staff fallback number (`agents.staff_phone_number`) | No Twilio/Plivo provisioning, no SIP inbound, no `phone_numbers` table |
| **Agents — rules** | Instructions tab + Rules tab shortcuts | No rules engine; “Add rule” deferred |
| **Agents — languages** | Primary language on agent | Multi-language picker disabled; detect-language switch UI-only |
| **Call routing** | DB fields (answering mode, ring, hold music) | **Not enforced** in voice worker (no staff-first routing) |
| **Turnstile** | Widget + server verify code exists | **Disabled** (`if (false && …)` in `app/smb/actions.ts`) — intentional per product decision |
| **Analytics** | Real queries + filters | Location-level analytics needs appointment→location FK; no export |
| **Notifications** | Prefs stored in `organization_settings` | No delivery for post-call summary, reminders, staff alerts |
| **Feature flags** | Stored in DB, assistant can toggle | **Not wired to sidebar/nav** — disabled features still visible |
| **Voice design** | Actions + UI + unit tests | Live E2E blocked on Fish Audio credits |
| **Availability engine** | Full slot generation | Per-slot buffer time; slot-holder/deposit behavior |
| **Settings** | Most tabs functional | 2FA stub; sign-out-all is current session only |
| **Staff presence** | Filter buttons in UI | Disabled — no real-time presence system |

### ❌ Not started (design doc calls for these)

| Area | Design doc reference | Notes |
|------|---------------------|-------|
| **SIP / PSTN inbound** | Pages 1–3 inbound call flow | Twilio/Plivo → LiveKit SIP not wired |
| **Provider adapter layer** | Page 2 provider architecture | SDKs used directly; no swappable interfaces for voice/LLM/telephony/calendar |
| **RAG at call time** | Page 3 Knowledge Base | Partial — txt/md/html + website + FAQ + pgvector; PDF/DOCX upload still missing |
| **AI tools: cancel/reschedule** | Page 3 tool list | Voice has book + check only; no cancel/reschedule/CRM-note tools |
| **Call transfer** | Page 3 (future) | Not started |
| **Follow-up email tool** | Page 3 (future) | Not started |
| **Slack / Stripe / Zapier / Outlook** | Page 2 integrations | Catalog “Coming soon” only |
| **Cal.com integration** | Pages 1–2 stack | Not in catalog or code |
| **External REST API + API keys** | Pages 1–2 | No org API keys table, no public API |
| **Audit logs** | Page 2 database modules | No table or UI |
| **Team invites / multi-org** | Page 2 members | Single org per user; no invite flow |
| **Dark mode** | Page 5 user menu | Explicitly deferred (light mode v1) |
| **TanStack Query + Zustand** | Page 4 standards | Not adopted; uses server components + local state |
| **React Hook Form** | Page 4 standards | Most forms use controlled state |

Public booking URL is **`/smb/[slug]`** (not `/book/[slug]` — old paths in some docs/plans are stale).

---

## UI/UX polish (Page 5)

_Done 2026-08-06: Home stat trends vs prior 7 days; Watch video → `/guides`; phone CTAs on Home/sidebar (no dummy number); Analytics channel filter + week granularity + real service/staff counts + revenue from service prices; Agents Rules/Advanced tabs (shortcuts, not dead-ends); Calendar click-slot-to-create + staff filter popover; Integrations Coming soon / Available badges; Phone numbers page (staff fallback); Business service Type/Price/Duration filters; Staff presence filters disabled with tooltip; Settings password reset email + 2FA coming-soon toast._

Still open for Page 5:
- Wire **feature flags** to sidebar visibility (Settings → Features toggles should hide nav items).
- **Header** notification popover is empty shell (by design for v1, but no real notifications yet).
- **Upgrade card** in sidebar bottom — present but no billing/subscription backend.
- Some pages still use `@base-ui/react` shadcn fork (not Radix) — acceptable deviation from Page 5 text.

---

## Pending — recommended build order

1. ~~**Persist transcripts + generate summaries** after voice calls~~ _Done 2026-08-06 — see Voice & Calling section._
2. ~~**Knowledge base / RAG**~~ _Done 2026-08-06 — pgvector chunks, indexing worker, `search_knowledge` voice tool, Business Knowledge/FAQ tabs._
3. **Google Calendar OAuth + sync** — real OAuth, push appointments on book/cancel (replace incorrect “done” assumption below).
4. **Twilio telephony** — number provisioning + inbound routing to LiveKit SIP.
5. **Notification delivery** — wire stored prefs to Resend (reminders, post-call summary, staff alerts).
6. **Rules engine** — structured rules table + prompt injection or tool gating.
7. **Voice tools** — cancel/reschedule appointment, create/update CRM contact notes.
8. **Re-enable Turnstile** on public calls when ready (`app/smb/actions.ts` — remove `false &&`).
9. **External API** — org API keys + webhook inbound + Zapier trigger endpoint.
10. **Per-slot buffer time** in availability engine.

---

## CI/CD & Deployment

- **Auto-run Supabase migrations on merge** (raised 2026-08-01, during auth/orgs/dashboard-shell phase): set up a GitHub Actions workflow that runs `supabase db push` automatically when `supabase/migrations/**` changes and merges to `main`. Needs a `SUPABASE_ACCESS_TOKEN` GitHub secret (CLI access token, distinct from the app's publishable/secret keys). Belongs in a future "CI/CD & deployment" sub-project, not this phase.

  _Done 2026-08-03: `.github/workflows/migrations.yml` runs `supabase link --project-ref` + `supabase db push --linked` on merge to `main` when `supabase/migrations/**` or `supabase/config.toml` change (also `workflow_dispatch`). Requires `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD` repo secrets — documented in the workflow header. Not yet exercised live: needs a repo with the secrets set._

---

## Integrations

- **Wire up real integrations, starting with a short first-party list** (raised 2026-08-02): the current Integrations catalog (`lib/data/integration-catalog.ts`, ~20 entries) is decorative — nothing actually connects. Realistic first-party build order, ranked by effort/value with the current stack (Supabase, BullMQ/Redis, Groq, Next.js server actions):
  1. **Google Calendar** — OAuth2 + Calendar API. Highest value, feeds the already-built Availability/Calendar pages.
  2. **Webhook Tool** — outbound HTTP POST on events (new booking, new message). No OAuth, trivial to build for real.
  3. **Slack** — incoming webhook URL pasted by the user, POST notifications on events. No app review needed.
  4. **Twilio** — real SDK call for SMS/voice number provisioning; `staff_phone_number` field already exists on `agents`.
  5. **Stripe** — Checkout/Payment Links for booking-page deposits; ties into Analytics/Home revenue (currently sums service prices on linked appointments, not actual payments).
  6. **Zapier** — via a public webhook/API key we expose ("Webhooks by Zapier" trigger), not a listed Zapier app.
  7. **Microsoft Calendar (Outlook)** — same shape as Google Calendar, second priority since Google covers most demand.

   _Done 2026-08-04: `webhook-tool` now stores a per-org URL/event/secret config in `organization_integrations.config`, dispatches BullMQ jobs on `appointment.created`, `appointment.cancelled`, and `conversation.completed`, signs POSTs with `X-Frontdesk-Signature`, and exposes a config form in the Integrations UI. Delivery runs in `workers/webhook.ts` via `worker:webhook`._

   **Google Calendar — NOT done (corrected 2026-08-06):** only enable/disable toggle exists in Integrations UI. No OAuth login, no token storage in `organization_integrations.config`, no Calendar API calls, no sync on book/cancel. Previous “done” note in this file was inaccurate. `configureGoogleCalendarSchema` in `lib/validations/integration.ts` is unused.

   Not realistic short-term (needs partner approval, app review, or a business relationship, not just code): SIP Trunk, RingCentral, Salesforce, HubSpot, Zoho, JotForm, Typeform, Zendesk, MCP Server, Mailgun, SendGrid, Calendly, Make. Catalog UI marks these as "Coming soon" vs "Available" (`webhook-tool`, `google-calendar` marked Available — GCal should stay Available only after OAuth ships, or be demoted to Coming soon until then).

---

## Calendar

- **Appointment blocks aren't clickable** (raised 2026-08-02, found during E2E verification): the week-grid appointment blocks in `app/(dashboard)/calendar/calendar-client.tsx` have no click handler — no way to cancel or edit an appointment from the grid itself, only create new ones via the toolbar buttons. `cancelAppointment` action already exists in `app/(dashboard)/calendar/actions.ts`, just needs UI wiring (click block → open a detail/edit popover or reuse the New Appointment dialog in edit mode → Cancel button calling the existing action).

  _Done 2026-08-03: blocks now open a detail dialog with Cancel (two-step confirm via `cancelAppointment`) and Edit (prefilled form saved via new `updateAppointment` action + `updateAppointmentSchema` in `lib/validations/calendar.ts`). Create/edit share one `AppointmentFormFields` component; time select now covers all day in 30-min slots. Tests in `app/(dashboard)/calendar/actions.test.ts`._

  _Done 2026-08-06: click empty hour cell → New Appointment with prefilled date/time; staff filter popover on toolbar._

---

## Voice & Calling

- **CAPTCHA/Turnstile bot protection for public calls** (raised 2026-08-02): the public call booking endpoint (`app/smb/actions.ts`) currently relies on IP-based rate limiting (5 calls/hour per IP via `lib/voice/rate-limit.ts`) as the v1 bot protection strategy. CAPTCHA or Turnstile should be added before production launch for defense-in-depth, but is deferred as out-of-scope for this phase.

  _Partial 2026-08-03: Cloudflare Turnstile widget (`components/voice/turnstile.tsx`) renders on the public booking page and server verify exists in `app/smb/actions.ts` via `challenges.cloudflare.com/turnstile/v0/siteverify`. **Currently disabled** with `if (false && process.env.TURNSTILE_SECRET_KEY)` — re-enable when product is ready. Uses `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (placeholders in `.env.example`). Rate limiting is unchanged alongside it._

- **SIP trunk / real phone-number inbound calls** (raised 2026-08-02): future work once Twilio integration (tracked in existing Integrations section) ships. The voice agent worker (`workers/voice-agent.ts`) is transport-agnostic at the LiveKit-room level, so SIP calls and web-call-initiated calls should be reusable through the same `AgentSession` logic once inbound call routing is wired.

- **Booking-page visual customization** (raised 2026-08-02): this phase ships the minimum public booking page (`app/smb/[slug]/`) needed to host the call widget (business name/hours/services list + call button). Full booking-page builder with themes and layout options is future work; the current page is functional but not a polished product feature.

  _Done 2026-08-04+: booking page builder exists at `app/(dashboard)/booking-page/` with themes, accent, media upload, preview — substantially beyond the original “minimum” scope._

- **IP-based rate limiting spoofability** (raised 2026-08-02): rate limiting in `app/smb/actions.ts` via `x-forwarded-for` header is spoofable without a trusted reverse-proxy configuration that overwrites (rather than appends to) client-supplied header values. This is a known deployment-level concern, not fixable in application code alone — requires confirmation that the hosting platform (Vercel, nginx, etc.) actually normalizes this header before the app sees it.

- **Voice worker event semantics verification** (raised 2026-08-02): the voice agent worker's `AgentSession` error and close event handling has not been fully tested against live traffic. Specifically, it's unclear whether `AgentSessionEventTypes.Error` fires for every STT/LLM/TTS failure mode, or whether some failures only surface via `Close` events with `CloseReason.ERROR`. This should be revisited once live test calls are possible to ensure all failure paths are properly logged and retried.

  _Partial 2026-08-06: `workers/voice-agent.ts` now logs structured close/error context (`reason`, `source`, `type`, error message) via `describeSessionEvent` so live calls can distinguish Error vs Close failure paths. Full verification against production traffic still pending._

- **Transcript + summary persistence** (raised 2026-08-06, design doc gap audit): `updateConversationStatus` supports `transcript` and `summary` fields but the voice worker only wrote status/outcome/duration.

  _Done 2026-08-06: `CallTranscriptCollector` (`lib/voice/call-transcript-collector.ts`) listens to LiveKit `ConversationItemAdded` in `workers/voice-agent.ts`, persists `transcript` on finalize, and generates a Groq summary via `lib/voice/generate-call-summary.ts`._

- **Call recordings + playback** (raised 2026-08-06, design doc gap audit): plan in `docs/superpowers/plans/2026-08-03-call-recording-playback.md`.

  _Done 2026-08-06: LiveKit Room Composite Egress (`lib/voice/recording.ts`) starts on dashboard + public web calls; `room_name` + `recording_path` on `conversations` (migration `00000000000032_conversation_recording.sql`); `/api/webhooks/livekit` writes `recording_path` on `egress_ended`; signed URL playback via `getConversationRecordingUrl` + `CallAudioPlayer` in the conversation detail sheet. Requires `SUPABASE_STORAGE_S3_*` env vars and LiveKit Cloud webhook POST to `https://<domain>/api/webhooks/livekit` for production capture._

- **Call routing enforcement** (raised 2026-08-06): `answering_mode`, `max_ring_seconds`, `hold_music` on `agents` are editable in UI but not read by `workers/voice-agent.ts`.

- **Create-voice pipeline unverified live** (raised 2026-08-03, Voices tab phase): `designVoiceCandidates`/`saveVoiceModel` (`app/(dashboard)/agents/[id]/actions.ts`) are implemented and unit-tested (mocked), but the real Fish Audio `/v1/voice-design` call is blocked on account credit ($0 balance, a top-up attempt didn't land — `cumulative_top_up` stayed `"0"`). Needs a real end-to-end test (generate candidates → preview → save as model → appears as a real selectable voice) once billing is sorted. Note: `GET /model` (search/list, used by `searchVoices`) does **not** require credit — confirmed working with $0 balance — only `/v1/voice-design` (paid, no free tier) and TTS/STT synthesis are gated.

  _Partial 2026-08-06: Fish API error responses (including 402/403 credit errors) are surfaced with clearer messages; empty candidate lists are rejected; custom/org-created voices can be previewed on demand via new `previewVoice` action (TTS sample) in the Voices tab._

- **Newly-created voices don't join the curated Recommended list** (raised 2026-08-03): voices saved via the Create Voice dialog become the agent's active voice immediately but aren't added to `lib/data/voice-catalog.ts`'s static `voiceCatalog` array, so they won't show up in the Voices tab's default "Recommended" list — only reachable again via search by name, or as "Currently using". Low priority; would need either a per-org custom-voices table or an on-the-fly merge of "voices this org has created" into the Recommended list.

  _Done 2026-08-03: `saveVoiceModel` now inserts into a per-org `custom_voices` table (migration `00000000000026_custom_voices.sql`, RLS org-scoped) and the Voices tab merges `[...customVoices, ...voiceCatalog]` into the default list. `agents.voice_id` is selected alongside the rest of the agent row._

- **Voices tab agent-selector duplicate voice-picker UX** (raised 2026-08-03): the Voices tab always edits the page's current `agent` (from the URL), same as every other tab. If multi-agent orgs need to assign a *different* agent's voice without navigating away first, that's not currently possible from the Voices tab itself — only via the page-level agent selector (which navigates to that agent's own page). Revisit if that workflow turns out to matter.

  _Done 2026-08-06: Voices tab includes an in-tab receptionist `Select` (when `agents.length > 1`) that switches which agent's `voice_id` is edited via `updateAgentGeneral` without leaving the tab._

- **Real slot/availability engine for voice booking** (raised 2026-08-03, voice-agent booking-tools phase): the new `check_availability` tool only does a simple appointment-time overlap check (query `appointments` for the org, reject if the requested `[startsAt, endsAt)` overlaps a non-cancelled row) — it does not account for business hours (`lib/data/availability.ts`'s `getBusinessHours`), staff-specific schedules, time-off blocks (`time_off` table), or buffer time between appointments. No such full slot-computation engine exists anywhere in the app yet (the public booking page also has no free/busy slot picker today). Build a real "list open slots for a date range, respecting hours/staff/time-off/buffers" function once a concrete need for it surfaces (e.g. the public booking page gets a slot picker), and swap the voice tool over to call it instead of its current bare overlap check.

  _Done 2026-08-04 (cycle 1): `lib/data/availability-engine.ts` `getAvailableSlots` now generates slots per day honoring `business_hours` + `staff_hours` (staff override), closed `availability_exceptions`, `time_off` blocks (company/staff scope), non-cancelled `appointments`, and the `advance_booking_window_days` / `minimum_booking_notice_minutes` cutoffs from `business_profile`; `getStaffForBookingPage` exposes staff for the picker. Backed by migrations adding `staff_hours`, `staff_id`/`service_id` on appointments, and the new public slot-lookup + booking server actions + multi-step booking flow (`app/smb/[slug]/booking-flow.tsx`). Voice `check_availability`/`book_appointment` tools were swapped onto it (`lib/voice/booking-tools.ts`). Still not covered: per-slot buffer time between appointments, and slot-holder/deposit behavior — noted for a later cycle._

- **Google Calendar sync for voice-booked appointments** (raised 2026-08-03, voice-agent booking-tools phase): appointments booked by the AI receptionist are not pushed to any external calendar — depends on Google Calendar OAuth + sync (see Integrations section above). Once built, wire `book_appointment`'s tool handler to also create/block the corresponding external calendar event when the org has Google Calendar connected.

---

## Knowledge Base

- ~~**RAG pipeline**~~ _Done 2026-08-06: FastEmbed BGE (`bge-small-en-v1.5`) + hybrid RRF (pgvector + Postgres FTS) in `searchKnowledgeServiceRole`; `worker-knowledge` in docker-compose; `search_knowledge` voice tool._

- **Auto-capture FAQ gaps** (future): unanswered caller questions → suggested FAQ entries.

---

## Notifications

- **Deliver stored notification preferences** (raised 2026-08-06): `organization_settings` stores `notify_post_call_summary`, `notify_appointment_reminders`, `notify_client_bookings`, `notify_staff_bookings` and Settings UI toggles persist them, but no worker sends email/Slack for any of these events except appointment confirmation on booking.

---

## Pre-existing code issues

- **`app/smb/actions.ts` TypeScript errors** — `parsed.data` possibly undefined (lines ~60, 65, 181); fix before strict CI.
