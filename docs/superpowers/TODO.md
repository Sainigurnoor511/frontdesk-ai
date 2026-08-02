# Deferred Work

Items raised during development that are out of scope for the current phase but should be picked up later. Add a dated entry when something is deferred; remove it once done (and note where it landed).

## CI/CD & Deployment

- **Auto-run Supabase migrations on merge** (raised 2026-08-01, during auth/orgs/dashboard-shell phase): set up a GitHub Actions workflow that runs `supabase db push` automatically when `supabase/migrations/**` changes and merges to `main`. Needs a `SUPABASE_ACCESS_TOKEN` GitHub secret (CLI access token, distinct from the app's publishable/secret keys). Belongs in a future "CI/CD & deployment" sub-project, not this phase.

## Integrations

- **Wire up real integrations, starting with a short first-party list** (raised 2026-08-02): the current Integrations catalog (`lib/data/integration-catalog.ts`, ~20 entries) is decorative — nothing actually connects. Realistic first-party build order, ranked by effort/value with the current stack (Supabase, BullMQ/Redis, Groq, Next.js server actions):
  1. **Google Calendar** — OAuth2 + Calendar API. Highest value, feeds the already-built Availability/Calendar pages.
  2. **Webhook Tool** — outbound HTTP POST on events (new booking, new message). No OAuth, trivial to build for real.
  3. **Slack** — incoming webhook URL pasted by the user, POST notifications on events. No app review needed.
  4. **Twilio** — real SDK call for SMS/voice number provisioning; `staff_phone_number` field already exists on `agents`.
  5. **Stripe** — Checkout/Payment Links for booking-page deposits; ties into the Revenue metric on Analytics/Home, currently hardcoded to $0.
  6. **Zapier** — via a public webhook/API key we expose ("Webhooks by Zapier" trigger), not a listed Zapier app.
  7. **Microsoft Calendar (Outlook)** — same shape as Google Calendar, second priority since Google covers most demand.

  Not realistic short-term (needs partner approval, app review, or a business relationship, not just code): SIP Trunk, RingCentral, Salesforce, HubSpot, Zoho, JotForm, Typeform, Zendesk, MCP Server, Mailgun, SendGrid, Calendly, Make. Catalog UI should mark these as "Coming soon" vs "Available" once the first 1-2 are real.

## Calendar

- **Appointment blocks aren't clickable** (raised 2026-08-02, found during E2E verification): the week-grid appointment blocks in `app/(dashboard)/calendar/calendar-client.tsx` have no click handler — no way to cancel or edit an appointment from the grid itself, only create new ones via the toolbar buttons. `cancelAppointment` action already exists in `app/(dashboard)/calendar/actions.ts`, just needs UI wiring (click block → open a detail/edit popover or reuse the New Appointment dialog in edit mode → Cancel button calling the existing action).

## Voice & Calling

- **CAPTCHA/Turnstile bot protection for public calls** (raised 2026-08-02): the public call booking endpoint (`app/book/actions.ts`) currently relies on IP-based rate limiting (5 calls/hour per IP via `lib/voice/rate-limit.ts`) as the v1 bot protection strategy. CAPTCHA or Turnstile should be added before production launch for defense-in-depth, but is deferred as out-of-scope for this phase.

- **SIP trunk / real phone-number inbound calls** (raised 2026-08-02): future work once Twilio integration (tracked in existing Integrations section) ships. The voice agent worker (`workers/voice-agent.ts`) is transport-agnostic at the LiveKit-room level, so SIP calls and web-call-initiated calls should be reusable through the same `AgentSession` logic once inbound call routing is wired.

- **Booking-page visual customization** (raised 2026-08-02): this phase ships the minimum public booking page (`app/book/[slug]/`) needed to host the call widget (business name/hours/services list + call button). Full booking-page builder with themes and layout options is future work; the current page is functional but not a polished product feature.

- **IP-based rate limiting spoofability** (raised 2026-08-02): rate limiting in `app/book/actions.ts` via `x-forwarded-for` header is spoofable without a trusted reverse-proxy configuration that overwrites (rather than appends to) client-supplied header values. This is a known deployment-level concern, not fixable in application code alone — requires confirmation that the hosting platform (Vercel, nginx, etc.) actually normalizes this header before the app sees it.

- **Voice worker event semantics verification** (raised 2026-08-02): the voice agent worker's `AgentSession` error and close event handling has not been fully tested against live traffic. Specifically, it's unclear whether `AgentSessionEventTypes.Error` fires for every STT/LLM/TTS failure mode, or whether some failures only surface via `Close` events with `CloseReason.ERROR`. This should be revisited once live test calls are possible to ensure all failure paths are properly logged and retried.
