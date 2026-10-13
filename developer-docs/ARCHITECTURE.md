# Frontdesk.ai Architecture Guide

A living reference for the project's architecture, patterns, and conventions. Last full scan: 2026-10-08.

## Index

| Section | Description |
| --- | --- |
| [Architecture Overview](#architecture-overview) | High-level structure and directory layout |
| [Supabase & Database](#supabase--database) | Client layers, auth flow, RLS, storage, migrations |
| [Route Groups & Pages](#route-groups--pages) | App Router layout, server/client split pattern, API routes |
| [Server Actions](#server-actions) | Validation, org-scoping, error handling |
| [Data Access Layer](#data-access-layer) | `lib/data/` modules and query conventions |
| [Background Workers](#background-workers) | BullMQ job host, LiveKit voice worker, Redis |
| [Voice Pipeline](#voice-pipeline) | LiveKit and AssemblyAI call flows, shared tools |
| [Knowledge Base](#knowledge-base) | Ingestion, embeddings, hybrid search |
| [Integrations](#integrations) | Calendars, telephony, outbound webhooks |
| [UI & Components](#ui--components) | shadcn/ui on Base UI, Tailwind v4, Lucide |
| [Validation](#validation) | Zod schemas in `lib/validations/` |
| [Testing](#testing) | Vitest setup, test file conventions, known baseline |
| [Docker Setup](#docker-setup) | Dockerfile, docker-compose, nginx |
| [CI](#ci) | GitHub Actions |
| [Environment Variables](#environment-variables) | All env vars and their purpose |

---

## Architecture Overview

```
frontdesk-ai/
├── app/                        # Next.js 16 App Router
│   ├── (auth)/                 # Login, signup, OAuth callback
│   ├── (dashboard)/            # Main app pages (org-scoped)
│   │   └── actions/            # Shared actions (voice calls, sidebar prefs)
│   ├── (settings)/             # Account + organization settings (2FA, sessions)
│   ├── api/                    # Route handlers (see API Routes)
│   ├── onboarding/             # Post-signup onboarding wizard
│   ├── smb/[slug]/             # Public booking page (no auth)
│   ├── robots.ts, sitemap.ts, opengraph-image.tsx
│   └── layout.tsx, globals.css, not-found.tsx
├── components/
│   ├── ui/                     # Vendored shadcn/Base UI primitives (+ orb, waveform, chat bubbles)
│   ├── agents/                 # Agent creation wizard, voice dialogs, instructions generator
│   ├── auth/                   # Login/signup forms
│   ├── brand/                  # Logo components
│   ├── calendar/               # Date picker field
│   ├── conversations/          # Detail sheet, audio player, status badge
│   ├── layout/                 # Sidebar, header, nav, feedback, unsaved-changes bar
│   ├── onboarding/             # Intro sequence
│   └── voice/                  # Call dialog, voice-call hook, voice picker, Turnstile
│       └── assemblyai/         # Browser WebSocket session, PCM worklet, audio playback
├── hooks/                      # Shared React hooks
├── lib/
│   ├── assistant/              # In-app assistant (Groq tool-calling loop + tools)
│   ├── conversations/          # Display helpers, date filters, recording paths, transcript playback
│   ├── crawler/                # Website crawler (robots.txt, fetch, crawl)
│   ├── data/                   # Data access layer (Supabase queries)
│   ├── email/                  # Resend appointment confirmations
│   ├── integrations/           # Google/Microsoft calendar, Cal.com, Calendly, Twilio, webhooks
│   ├── knowledge/              # Chunking, file text extraction, hybrid search
│   ├── providers/
│   │   ├── embedding/          # FastEmbed (local BGE)
│   │   └── llm/                # Groq extraction provider
│   ├── queue/                  # BullMQ: connection, lazyQueue, queues/, processors/
│   ├── seo/                    # Site metadata, booking-page JSON-LD
│   ├── supabase/               # Client factories (browser, server, service-role, proxy session)
│   ├── validations/            # Zod schemas for all domains
│   ├── voice/                  # Agent context, tools, LiveKit adapters, recording, metrics
│   │   ├── adapters/           # Fish Audio TTS
│   │   ├── providers/assemblyai/  # AssemblyAI Voice Agent provider
│   │   └── tools/              # Provider-neutral voice tool handlers
│   └── crypto.ts, utils.ts, booking-theme.ts, public-booking-url.ts, ...
├── workers/                    # Standalone Node processes (jobs.ts, voice-agent.ts)
├── scripts/                    # dev-voice.ts (lk agent dev), prepare-standalone.ts (postbuild)
├── supabase/                   # config.toml + numbered migrations
├── docker/                     # nginx.conf
├── proxy.ts                    # Next 16 request proxy (Supabase session refresh)
└── Dockerfile                  # Multi-stage build (runner, worker, worker-voice)
```

---

## Supabase & Database

### Three Client Layers

| Client | File | Auth | RLS | Used By |
| --- | --- | --- | --- | --- |
| Browser | `lib/supabase/client.ts` | Cookie session | Enforced | React components |
| Server | `lib/supabase/server.ts` | Cookie session (via `cookies()`) | Enforced | Server Components, Server Actions |
| Service-role | `lib/supabase/service-role.ts` | `SUPABASE_SECRET_KEY` | Bypassed | Workers, public booking paths, webhooks |

**Key design choice:** `service-role.ts` does NOT import `server-only` — this is intentional so standalone workers (which run outside Next.js) and Vitest can use it. `server.ts` imports `server-only` to prevent client-side leaks.

### Auth Flow

- Supabase Auth handles signup/login (email + Google OAuth), plus TOTP two-factor via `supabase.auth.mfa.*` (enrolled in settings and enforced at login: a session holding a verified factor but no `aal2` claim is redirected to `/verify`)
- The `/verify` challenge screen runs `mfa.challenge()` + `mfa.verify()` in `verifyMfaChallenge` (`app/(auth)/actions.ts`), bounded at `MFA_MAX_ATTEMPTS` (5) code attempts per user, with `cancelMfaChallenge` as the escape hatch so a stuck session can always sign out. Teardown signs out with `{ scope: 'local' }` — auth-js defaults to `global`, which would revoke every session the user holds and make a forced logout a password-only attack
- The attempt budget is Redis state keyed by user id (`lib/auth/mfa-attempts.ts`), not a cookie: a request-supplied count resets by simply being omitted. Each attempt is **reserved before the code reaches Supabase**, by one Lua script that checks the budget and takes a slot atomically, so parallel requests cannot spend more than what is left. The slot is kept for a wrong code, a non-fatal challenge error, a thrown `verify()` (it may have been evaluated) and a fatal error; it is given back when Supabase throttled the request or `challenge()` threw, because then no code was evaluated; a verified code clears the budget (`DEL`). The two write directions differ: a **reservation** creates or updates the counter with `SET … EX` in one command, so no key can exist without its 10-minute TTL — the old `INCR` then `EXPIRE` pair could leave a count that never expired; a **release** writes the decremented value with `SET … KEEPTTL`, which keeps the expiry the reservation set and never recreates a key that has already expired, so it cannot produce a key without a TTL either. `KEEPTTL` needs **Redis ≥ 6.0**: on an older server every release fails (logged and swallowed), so attempts Supabase never evaluated stay counted and users run out of attempts sooner than the five promised. A refused reservation does not refresh the TTL, so a locked-out requester cannot extend the lockout. Neither a fresh password sign-in nor a sign-out clears the budget, because both are things an attacker holding the password can do. The one other thing that clears it is a **verified recovery link** in `/callback`: see the remedy below
- **Sign-in and password reset for MFA users now depend on Redis.** A reset link sends an MFA user through the same code step (step 3 below), so an unreachable Redis blocks both: during an outage an MFA user can neither sign in nor reset a forgotten password, and operators should expect support reports of a "broken" reset flow, not only of sign-in. The counter has its own client, separate from BullMQ's (`lib/queue/connection.ts` uses `maxRetriesPerRequest: null` with the offline queue on, under which a command during an outage queues and retries forever — sign-in hung on "Verifying…"). The auth client has the offline queue off, one retry and a command timeout, and every call runs in two bounded phases: opening the transport (DNS, TCP, TLS) on a client that has not connected yet, within `MFA_REDIS_CONNECT_TIMEOUT_MS` (3s), so a healthy cold start against a remote `rediss://` server is not refused; then the Redis handshake and the command, within `MFA_REDIS_TIMEOUT_MS` (1s). A refused port fails at once, a server that accepts the connection but never answers is refused within 1s, and an unroutable host takes the 3s connect budget. When Redis is unreachable it **fails closed**: the code is not checked, the user sees "temporarily unavailable" and keeps the pending session to retry. The counter is the only per-account guessing bound the app owns (Supabase's verify throttling is per calling IP, which is this server), nobody outside the deployment can cause a Redis outage, and only the second step of an MFA sign-in is affected — users without MFA and already-elevated sessions are not
- Error copy for the code step comes from `mfaErrorMessage()` in `lib/auth/mfa.ts`, never from the provider's message. Its "Too many attempts. Please wait a few minutes and try again." is Supabase's own verify throttling (`over_request_rate_limit`, or a code-less 429), and that limit is keyed on the calling IP, which for every sign-in is this app server. It is therefore **one limit shared by the whole deployment**: during a burst of concurrent MFA sign-ins, an unrelated user can see that message on their very first code. The failure is confusing rather than damaging, because a `throttled` result releases the reserved slot, so the local five-attempt budget does not move. Before a large tenant lands, check the Supabase project's MFA verification rate limit (Auth rate limits in the dashboard) against expected peak concurrent sign-ins
- The budget is per user, not per user and client IP, and that is accepted deliberately. Anyone holding the password can burn the five attempts and lock the owner out of the code step for 10 minutes, repeatably. Keying on IP would remove that, but this repo's only client-IP source is the request headers (`app/smb/actions.ts` falls back to the leftmost `x-forwarded-for` entry, which the client controls), so a per-IP budget would hand an attacker a fresh budget per forged header, and even with a trusted proxy, per IP per user means the guess budget scales with the attacker's address pool. The requester-resettable cookie counter it replaced was not a DoS primitive only because it was not a limit at all. An attacker with the password is the real incident, and the lockout is the symptom. The owner's remedy is a password reset, which runs as follows in the code:
  1. The owner requests a link at `/forgot-password` (`requestPasswordReset`). Opening it lands on `/callback?flow=recovery`, which exchanges the PKCE code; GoTrue issues a session whose token carries `amr: [{ method: 'recovery' }]`
  2. `/callback` verifies that claim (`recentRecoverySubject`, via `getClaims()`) and, only then, treats the sign-in as a reset and clears the attempt budget for that user (`clearAttemptsAfterRecovery`), at most once per user per hour. One Lua script on the auth Redis client does it atomically: only if a non-zero counter exists does it take the `SET mfa:recovery-clear:<user> 1 NX EX 3600` claim and `DEL` the counter, so a link opened with a full budget (or by a user with no factor) spends nothing and a later lockout in the same hour still gets its refill. A second refill within the hour, or a Redis failure, leaves the budget as it is (logged) and the flow continues. `?flow=recovery` alone clears nothing and does not pick the destination: without a verified claim for the signed-in user, the callback routes as an ordinary sign-in
  3. A user with a confirmed pending factor is sent to `/verify` (the recovery session is aal1, and Supabase refuses a password change from aal1 once MFA is on). The owner enters a code against the fresh budget; `verifyMfaChallenge` sees the `recovery` entry, which GoTrue keeps on the session through the aal2 upgrade, and sends them to `/reset-password`. A user without a factor goes straight there, as before, and so does a session whose gate is `indeterminate` (usually a transient `getUser()` failure): `/reset-password` resolves the gate again, sending a really pending session to `/verify` and showing a "try again" panel while the check still cannot be made. It does the same when the recovery claim itself cannot be verified (`checkRecoveryClaim` returns `unverifiable` for a transport failure, distinct from an `absent` claim), so an Auth blip is never reported as an expired link. This step needs Redis for MFA users, so a Redis outage blocks password reset as well as sign-in for them
  4. `updatePassword` checks the recovery claim again (it must be under 15 minutes old, so the code step has to happen inside that window) and that the session is aal2, then calls `updateUser`. A pending factor redirects to `/verify`; an unverifiable claim or an indeterminate gate returns a retryable error to the form ("Your password was not changed"), never a silent redirect. GoTrue then deletes every other session of the user (`LogoutAllExceptMe` in `User.UpdatePassword`), which revokes the attacker's refresh tokens and leaves the old password useless for new pending sessions
  5. "Sign out all devices" in settings (`signOutAllDevices`, `scope: 'global'`) is still worth pressing, belt and braces, on GoTrue versions that predate that revocation. Neither step can revoke an access token already issued; it stays valid until it expires (`jwt_expiry`, an hour by default)

  Until step 4 the attacker still has the working password, so if they are burning codes at the same moment they can spend the refilled budget before the owner enters a code. Another link within the hour does not refill it again, so the owner may need to wait up to an hour for the next refill. **Accepted trade-off:** a verified reset link refills the five-guess budget, and that needs only the mailbox, not the password, because the recovery link is a sign-in in its own right. The mailbox alone does not get an MFA user's password: the recovery link yields an aal1 session, and GoTrue answers a password change from aal1 with 401 `insufficient_aal`. What the mailbox alone does get is a pending aal1 session and, through the refill, more guesses at the second factor. Uncapped, that rate would be 30 an hour (5 per 10 minutes) plus 5 per reset email, set by the deployment's email quota (`[auth.rate_limit] email_sent` in `supabase/config.toml`, raised freely with custom SMTP), which this code does not control. With the per-user hourly cap (`MFA_RECOVERY_CLEAR_INTERVAL_SECONDS`) it is bounded at 30 + 5 = 35 guesses an hour per account whatever the email quota, against a 6-digit code, where each guess has odds of roughly one in a million. The cost of the cap: if an attacker holding the password burns the refilled budget before the owner enters a code, the owner waits out the hour
- "Pending MFA" means: a verified factor in the `getUser()` response (never the session cookie, whose `user` object is unsigned, so `nextLevel` is never read) plus an `aal` claim that is not `aal2`. Resolved in `lib/auth/mfa.ts`, which fails closed and never rejects. A *returned* `getUser()` error is `unauthenticated` only when it positively says the session is absent or invalid (`AuthSessionMissingError`, `bad_jwt`, `session_expired`, …); auth-js 2.112.2 *returns* `AuthRetryableFetchError` for network failures and 5xx, and that, 429s and unrecognized errors are `indeterminate`, which every layer denies. `resolveMfaGateForUser` is intentionally not exported: it trusts the token's unsigned-decoded `aal` claim, which is only sound for a user that the same call just validated, so the only entry points are `resolveMfaGate()` and `getAssuredUser()`, which fetch the user themselves
- An account whose verified factors include no TOTP (phone MFA enabled at project level, or a factor added through the admin API) is `indeterminate` with `reason: 'unsupported_factor'`. It is denied like any indeterminate session, but `logIn` sends it to `/verify`, which explains that this app only checks authenticator codes and that whoever runs the workspace has to remove the other factor, instead of looping back to the password form
- Enforced in two layers. **`proxy.ts`** gates every non-exempt path and answers in the shape the caller can handle: an `x-action-redirect` header for server-action POSTs (what Next's action client follows into a navigation — a 307 made the browser re-POST `Next-Action` to `/verify` and the tab showed an action-resolution error; `e2e/mfa-action-redirect.e2e.ts` drives this end to end when its env is set), 401 JSON for programmatic `/api/*` calls (its `verifyPath` field is what fetch clients follow, via `mfaVerifyPathFromDenial()`; the assistant panel navigates to `/verify` on it), and a 303 to `/verify` for document navigations — including navigations to `/api/*` URLs such as the calendar OAuth callbacks, decided by `Sec-Fetch-Mode: navigate` (falling back to an `Accept: text/html` preference) rather than by path. **`getAssuredUser(supabase)`** from `lib/auth/mfa.ts` is then the authorization entry point inside every privileged server action, route handler and `lib/data` read helper. Use it instead of `supabase.auth.getUser()` anywhere a database write, queue job, service-role client or paid provider call follows: a bare `getUser()` is satisfied by a pending `aal1` session, and per Next's own proxy reference (`proxy.md:251`) the proxy is not a substitute for a check inside each server function
- **Bound of the guarantee: both layers live in Next, and the database is not a third.** No RLS policy checks `aal`, so the two-factor promise covers only traffic that goes through this app. A password-only session can call PostgREST directly with the publishable key and read or write its organization's rows as if two-factor were off; what the in-app gate does still cover is everything RLS never did (service-role writes, queue jobs, paid provider calls)
- Known gaps, tracked in `developer-docs/TODO.md` under "P1 - Auth hardening" and awaiting a product decision: the pending `aal1` access token still passes Postgres RLS (policies authorize on membership alone, so direct PostgREST access from the browser is not gated), and there is no self-service recovery for a lost authenticator — `unenrollTotpFactor` requires a satisfied gate, so a user without their authenticator cannot remove the factor themselves
- Operator recovery, until a self-service flow exists (lost authenticator, or an account stuck on an unsupported factor): from a trusted service-role context, list the user's factors with `supabase.auth.admin.mfa.listFactors({ userId })` and delete the offending one with `supabase.auth.admin.mfa.deleteFactor({ userId, id })`. With no verified factor left the account signs in on its password alone and can enrol a new authenticator in settings. Confirm the requester's identity out of band first — this removes the second factor
- `(auth)/callback/route.ts` handles OAuth callbacks; OAuth sign-ins are challenged exactly like password sign-ins (the gate is a property of the session, not the credential type)
- Password reset: `/forgot-password` emails a link through `requestPasswordReset`; the link returns to `/callback?flow=recovery`, which signs the user in and sends them to `/reset-password` to choose a new password (`updatePassword`); a user with a factor goes through `/verify` first, as in the remedy steps above. Both `/reset-password` and `updatePassword` require `hasRecentRecoveryClaim()` (`lib/auth/recovery.ts`): the session's access token, verified by `supabase.auth.getClaims()` (WebCrypto against the project JWKS, or a `getUser()` round trip for HS256 tokens), must carry an `amr` entry `{ method: 'recovery' }` stamped within the last 15 minutes. GoTrue writes that entry when it exchanges a recovery link's PKCE code, so it cannot be produced without the mailbox, and `?flow=recovery` only picks the redirect. An ordinary signed-in session, aal1 or aal2, has no such entry and cannot change the password. This replaced an `fd_password_recovery=1` cookie whose presence alone was the check: it was unsigned and bound to no session, so until 2026-10-13 any signed-in session could send it and change the password without a reset link
- Next 16 uses `proxy.ts` (not `middleware.ts`): its `proxy()` calls `updateSession()` from `lib/supabase/middleware.ts`, which returns `{ response, mfa, authHeaders }` — the `getUser()` that refreshes session cookies on every non-static request is now the one the MFA gate makes, so the request count is unchanged

### Organization Scoping

Every org-scoped query resolves the caller's org server-side:

```typescript
// lib/data/organization.ts — canonical pattern
// getAssuredUser(), never supabase.auth.getUser(): the bare call accepts a session that still
// owes its TOTP code.
const user = await getAssuredUser(supabase)
if (!user) return null
const { data: member } = await supabase
  .from('members')
  .select('role, organization_id, organizations(id, name)')
  .eq('user_id', user.id)
  .single()
```

**Never use a client-supplied organization ID.** Always resolve via `getCurrentOrgAndUser()`. Public paths (`app/smb/`) instead resolve the org from the slug and validate the agent belongs to it.

### Row-Level Security

All member policies follow one pattern:

```sql
organization_id in (
  select organization_id from members where user_id = auth.uid()
)
```

Public read policies exist only where the booking page needs them (booking config, public agent columns, business-profile timezone), gated on `booking_page_enabled`.

### Storage Buckets

| Bucket | Created In | Holds |
| --- | --- | --- |
| `booking-page-media` | `_030` | Booking page images |
| `call-recordings` | `_032` | LiveKit egress MP3s and AssemblyAI OGG recordings |
| `knowledge-documents` | `_033` | Uploaded knowledge files |

### Migrations

45 numbered SQL files in `supabase/migrations/`. Next number: `046`.

| Migration | Tables/Features |
| --- | --- |
| `_001` | `organizations`, `members` |
| `_002` | Fix RLS recursion on members |
| `_003` | `agents`, `agent_scan_jobs` |
| `_004` | `appointments` (calendar) |
| `_005` | `availability` |
| `_006` | `clients` |
| `_007` | `staff` |
| `_008` | Agent general settings fields |
| `_009` | `conversations` |
| `_010` | `business_profiles` |
| `_011` | `organization_integrations` |
| `_012` | `organization_settings` |
| `_013` | `booking_pages` |
| `_014` | `feedback` |
| `_015–_016` | Organization slugs + backfill |
| `_017–_018` | Public read access for booking/agents |
| `_019` | Conversation call status |
| `_020` | Restrict public agent columns |
| `_021` | Sidebar preferences |
| `_022` | Organization language settings |
| `_023` | Favorite voices |
| `_024` | Conversation outcome default |
| `_025` | Agent `is_default` flag |
| `_026` | `custom_voices` |
| `_027` | Booking page theme/accent |
| `_028` | Appointment ↔ client/conversation links, service-role appointment policy |
| `_029` | `staff_hours`; staff/service on appointments and time off (availability engine) |
| `_030` | `booking_page_config` + versions, `booking-page-media` bucket |
| `_031` | Public business-profile read (timezone) |
| `_032` | Conversation `recording_path`/`room_name`, `call-recordings` bucket |
| `_033` | `knowledge_sources`, `knowledge_chunks`, `faqs`, `match_knowledge_chunks()`, `knowledge-documents` bucket |
| `_034` | FastEmbed embedding dimensions (384) |
| `_035` | `assistant_chats`, `assistant_chat_messages` |
| `_036` | Agent advanced settings (LLM model, reasoning effort, DTMF, background-speech filter, ...) |
| `_037` | Conversation `is_read` |
| `_038` | Google Calendar event id on appointments |
| `_039` | Cal.com booking uid on appointments |
| `_040` | Microsoft Calendar event id, Calendly scheduling URL |
| `_041` | `phone_numbers`, `blocked_phone_numbers` |
| `_042` | Agent `detect_language` |
| `_043` | `agent_rules` |
| `_044` | Agent `voice_provider` (`livekit` \| `assemblyai`), conversation `assemblyai_session_id` |
| `_045` | `reschedule_appointment_atomic()` — locks, re-checks the confirmed start, and re-checks the destination for overlaps in one transaction |

Apply with `npx supabase db push`. CI applies them on merge to `main` (see [CI](#ci)).

---

## Route Groups & Pages

### Layout Groups

| Group | Purpose | Layout |
| --- | --- | --- |
| `(auth)` | Login, signup, OAuth callback | Minimal centered layout |
| `(dashboard)` | Home, agents, analytics, assistant, availability, booking-page editor, business, calendar, clients, conversations, guides, integrations, phone-numbers, staff | Sidebar + header + main content |
| `(settings)` | Account + organization settings | Settings-specific layout |
| `onboarding` | Post-signup wizard (website scan → agent) | Standalone flow |
| `smb/[slug]` | Public booking page: call, book, reschedule/cancel | Public, no auth required |

Public booking pages and every action in `app/smb/actions.ts` are gated by `canUseBookingPage()` (`app/smb/access.ts`): open to anyone while the page is enabled, and to the organization's own members at any time. `?preview=1` only takes effect for members.

### Server-Wrapper + Client-Component Pattern

Pages that need both server data and client interactivity split into two files:

```
app/(dashboard)/page.tsx          ← Server Component (fetches data)
app/(dashboard)/home-client.tsx   ← Client Component (renders UI)
```

The server page fetches all data via `lib/data/` modules, then passes it as props to the client component. Every dashboard route also has a `loading.tsx` skeleton.

### API Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/assistant` | POST | Streams the in-app assistant's responses |
| `/api/conversations/[id]/recording` | GET | Recording playback proxy with Range support (RLS-scoped signed URL) |
| `/api/integrations/google-calendar/callback` | GET | Google OAuth callback |
| `/api/integrations/microsoft-calendar/callback` | GET | Microsoft OAuth callback |
| `/api/livekit/endpoint` | GET | Exposes `LIVEKIT_URL` so the client can prewarm |
| `/api/webhooks/livekit` | POST | Signed LiveKit webhook; stores recording path on `egress_ended` |
| `/api/webhooks/assemblyai` | POST | Signed `session.completed` webhook; enqueues transcript finalize |

---

## Server Actions

Located in `actions.ts` files next to their page (plus `app/(dashboard)/actions/` for cross-page actions). Pattern:

1. **Validate input** with Zod schema from `lib/validations/`
2. **Resolve org** via `getCurrentOrgAndUser()` or `supabase.auth.getUser()`
3. **Perform operation** via Supabase client
4. **Return** typed result or `{ error }` object

```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { mySchema } from '@/lib/validations/my-domain'

export async function myAction(input: MyInput) {
  const parsed = mySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  // ... resolve org, query, return
}
```

---

## Data Access Layer

`lib/data/` contains domain-specific query modules:

| Module | Domain |
| --- | --- |
| `agents.ts` / `agents-service.ts` | Agent CRUD (RLS vs service-role variants) |
| `agent-advanced-options.ts` | Advanced-settings options, Groq model resolution |
| `agent-rules.ts` | Structured `{trigger, action}` agent rules |
| `analytics.ts` | Overview metrics, call stats |
| `assistant-chats.ts` | Assistant chat history |
| `availability.ts` / `availability-engine.ts` | Hours, exceptions; slot generation and "available now" |
| `booking-page-config.ts` | Booking page editor config + versions |
| `booking-service.ts` | Service-role booking (public page + voice tools), triggers calendar sync |
| `business.ts` | Business profile, services, locations, assets, products |
| `calendar.ts` | Appointments |
| `clients.ts` | Client records |
| `conversations.ts` / `conversations-service.ts` | Transcripts, summaries, status |
| `countries.ts` / `industries.ts` | Static wizard data |
| `guides.ts` | Guides page content |
| `integration-catalog.ts` / `integrations.ts` | Integration catalog and org integration rows |
| `knowledge.ts` / `knowledge-service.ts` | Knowledge sources/FAQs; service-role search |
| `organization.ts` | Org + user resolution (`getCurrentOrgAndUser`) |
| `organization-slug.ts` | Slug generation/validation |
| `phone-numbers.ts` | Org-wide phone numbers |
| `settings.ts` | Org settings |
| `sidebar-preferences.ts` | UI preferences |
| `staff.ts` | Staff management |
| `voice-catalog.ts` | Available TTS voices, language defaults |

Modules ending in `-service.ts` use the service-role client (bypass RLS) — callers must have already authorized. Regular modules use the session-scoped server client.

---

## Background Workers

Two standalone Node processes in `workers/`.

### `jobs.ts` (BullMQ — all queues)

One process hosting every queue, with per-queue concurrency:

| Queue | Concurrency | Does |
| --- | --- | --- |
| `scan-website` | 1 | Crawls a URL, extracts business info via Groq, updates `agent_scan_jobs` |
| `knowledge-indexing` | 1 | Chunks and embeds knowledge sources and FAQs |
| `webhook-deliver` | 5 | Delivers outbound webhooks to an org's endpoint (3 attempts, exponential backoff) |
| `assemblyai-session-finalize` | 5 | Pulls transcript and recording for a finished AssemblyAI call |

Handlers live in `lib/queue/processors/*.ts`; producers in `lib/queue/queues/*.ts` are built with `lazyQueue()` (`lib/queue/lazy-queue.ts`), which defers the Redis connection until the first `add()` so importing a queue never opens a socket. `workers/jobs.ts` only wires processors to queues and owns graceful shutdown (SIGINT/SIGTERM close each Worker so in-flight jobs finish). The two queues at concurrency 1 are the CPU-bound ones (crawling, embedding) — raising them would stall the other queues in the shared event loop.

Set `WORKER_QUEUES` to a comma-separated subset to split a queue onto its own container without touching code. Unset runs everything; an unknown name fails startup loudly.

- Run: `pnpm start:jobs` (or `pnpm dev:jobs` to watch)

**Adding a queue:** producer in `lib/queue/queues/`, processor + `describe…Job` in `lib/queue/processors/`, entry in `QUEUES` in `workers/jobs.ts`.

### `voice-agent.ts` (LiveKit Agent)

- Registers as a LiveKit agent through `agents.cli.runApp`, which forks child processes that re-import the module — so **never** declare a BullMQ Worker here
- Prewarms the Silero VAD model; dispatched into rooms when callers join
- Runs STT → LLM → TTS; caches greeting audio (`lib/voice/say-cached.ts`)
- Writes conversation record + summary on hangup
- Run: `pnpm dev:voice` (wraps `lk agent dev`, needs the `lk` CLI) or `pnpm start:voice`

### Redis Connection

`lib/queue/connection.ts` — single `ioredis` instance for BullMQ, configured via `REDIS_URL`. Its `maxRetriesPerRequest: null` is what BullMQ workers need, and it is why nothing on a request path should borrow it. The MFA attempt budget (`lib/auth/mfa-attempts.ts`) opens its own bounded client on the same `REDIS_URL` and needs Redis ≥ 6.0; see [Auth Flow](#auth-flow).

---

## Voice Pipeline

Each agent's `voice_provider` column picks the engine. Both start from the same server actions — `startDashboardCall` (`app/(dashboard)/actions/voice.ts`) and `startPublicCall` (`app/smb/actions.ts`) — and neither puts a queue in the live call path.

### LiveKit (default)

```
Browser → Server Action (create room, mint token, insert conversation) → LiveKit WebRTC
                                                                              ↓
                                                                    voice-agent worker
                                       Silero VAD → Groq Whisper (STT) → Groq LLM (+ tools) → Fish Audio (TTS)
                                                                              ↓
                                                         Audio back to browser; egress → call-recordings
```

STT uses a fixed language or auto-detect (`agents.detect_language`). The LLM model comes from `agents.llm_model` via `resolveGroqModel()`.

### AssemblyAI (managed)

```
Browser → Server Action (insert conversation, build session config, mint 120s token)
   ↓
Browser ⇄ AssemblyAI Voice Agent WebSocket (STT + LLM + TTS + turn detection)
   ↓ tool.call                                   ↓ hangup
executeVoiceTool / executePublicVoiceTool      endAssemblyAiCall → assemblyai-session-finalize job
(server action → shared handlers)              (transcript, timeline, OGG recording, summary)
```

Browser side lives in `components/voice/assemblyai/` (WebSocket session, PCM capture worklet with in-worklet resampling, playback). AssemblyAI understands 18 input languages but speaks only 6 (en, es, de, fr, pt, it); `startAssemblyAiCall` rejects agents in other languages.

### Shared Tools

Tools are provider-neutral. `lib/voice/tools/*-handlers.ts` define them with `defineVoiceTool` (Zod-validated args); `buildVoiceToolHandlers()` in `lib/voice/tool-handlers.ts` composes them (honoring `skip_knowledge_retrieval`, `secure_mode`, and `identity_verification_enabled`). Both providers go through that one composition point: LiveKit via `lib/voice/livekit-tools.ts` (which wraps it in `livekit-tool-adapter.ts` for `AgentSession`), AssemblyAI by sending them as `session.tools` and relaying calls through `providers/assemblyai/tool-relay.ts`. Adding a handler module therefore reaches both engines by construction.

Current tools: `check_availability`, `book_appointment`, `find_appointment`, `cancel_appointment`, `reschedule_appointment`, `search_knowledge`, `take_message`.

`take_message` (`tools/escalation-handlers.ts`) is how a caller reaches a human: it captures name, callback number, reason, and caller-expressed urgency, writes a `caller_messages` row tagged `source = 'agent_escalation'` against the call's `conversation_id`, dispatches the `caller_message.created` webhook, and returns a spoken confirmation. It is ungated — it is the fallback for every other tool being withheld or failing. There is no live call transfer and cannot be one until the LiveKit SIP work lands (a browser call has no phone leg), so `buildSystemPrompt()` tells the agent explicitly that a "handoff to a human" rule resolves to taking a message.

Two gates are enforced in the composition point, not in the system prompt, so a withheld tool is both absent from the model's list and answers `unknown_tool` if dispatched anyway:

- `skip_knowledge_retrieval` omits `search_knowledge`.
- `secure_mode` **or** `identity_verification_enabled` omits all three manage-booking tools (`manageBookingToolsAllowed()`). Those tools authorize on organization + a caller-spoken email address, which is a single unverified factor; no verification tool exists in the shared handler set yet, so agents with either flag cannot manage existing appointments by voice at all. `buildSystemPrompt()` tells those agents to say so instead of reaching for a tool they do not have.

### Components

| Component | Location |
| --- | --- |
| Call initiation (server actions) | `app/(dashboard)/actions/voice.ts`, `app/smb/actions.ts` |
| Browser call hook / dialog | `components/voice/use-voice-call.ts`, `components/voice/call-dialog.tsx` |
| System prompt + rules + greeting | `lib/voice/agent-context.ts` |
| Tool handlers | `lib/voice/tools/`, `lib/voice/tool-handlers.ts` |
| Fish Audio TTS adapter | `lib/voice/adapters/fish-audio-tts.ts` |
| Recording (egress) | `lib/voice/recording.ts`, `lib/voice/recording-config.ts` |
| Transcript + summary | `lib/voice/call-transcript-collector.ts`, `lib/voice/generate-call-summary.ts` |
| Latency metrics | `lib/voice/session-metrics.ts` |
| Rate limiting | `lib/voice/rate-limit.ts` |
| AssemblyAI provider | `lib/voice/providers/assemblyai/` |
| Worker entry point | `workers/voice-agent.ts` |

---

## Knowledge Base

1. Sources: uploaded files (`knowledge-documents` bucket; text via `pdf-parse`/`mammoth` in `lib/knowledge/extract-file-text.ts`), website scans, and FAQs.
2. `knowledge-indexing` job chunks text (`lib/knowledge/chunk-text.ts`) and embeds it with FastEmbed (`lib/providers/embedding/client.ts`, default `bge-small-en-v1.5`, 384 dims) into `knowledge_chunks`.
3. Search (`lib/data/knowledge-service.ts`) runs `match_knowledge_chunks()` vector search and Postgres full-text search, fused with reciprocal rank fusion (`lib/knowledge/hybrid-search.ts`). `FASTEMBED_DISABLED=1` drops to lexical-only.

`next.config.ts` marks `fastembed` and `@anush008/tokenizers` as `serverExternalPackages` because AssemblyAI tool calls run knowledge search inside the Next app, and Turbopack cannot bundle the native tokenizer.

---

## Integrations

| Integration | Files | Notes |
| --- | --- | --- |
| Google Calendar | `lib/integrations/google-calendar*.ts`, OAuth callback route | Tokens encrypted with `lib/crypto.ts`; syncs on appointment create/update/cancel |
| Microsoft Calendar | `lib/integrations/microsoft-calendar*.ts`, OAuth callback route | Same pattern as Google |
| Cal.com | `lib/integrations/calcom.ts` | Per-org API key in the Integrations UI |
| Calendly | `lib/integrations/calendly.ts` | Scheduling link only; update/cancel are no-ops |
| Telephony | `lib/integrations/telephony.ts`, `twilio.ts` | Twilio number provisioning; Plivo/SIP slugs reserved. Inbound PSTN → LiveKit SIP not built yet |
| Outbound webhooks | `lib/integrations/webhook*.ts` | Events dispatched through the `webhook-deliver` queue |
| Email | `lib/email/send-appointment-confirmation.ts` | Resend |

The catalog shown in the UI is `lib/data/integration-catalog.ts`.

---

## UI & Components

- **Framework:** shadcn/ui (`base-nova` style) built on `@base-ui/react` (NOT Radix)
- **Composition:** uses `render={<Component />}` pattern (not `asChild`); link-styled buttons need `nativeButton={false}`
- **Icons:** `lucide-react` for all app-level icons
- **Styling:** Tailwind CSS v4 (`app/globals.css`, CSS variables, `next-themes` dark mode)
- **Extras:** AI Elements registry (`@ai-elements`) for chat UI, `motion` for animation, `recharts` for charts, `thinking-orbs` / three.js orb for call state

### Component Organization

| Directory | Contents |
| --- | --- |
| `components/ui/` | Vendored shadcn/Base UI primitives, plus orb, waveform, message/bubble chat pieces |
| `components/agents/` | Agent creation wizard (`wizard/` steps), voice creation, instructions generator |
| `components/auth/` | Login/signup forms |
| `components/brand/` | `<Logo />`, `<LogoMark />`, `<LogoWordmark />` drawn from the dot coordinates in `logo-data.ts` |
| `components/calendar/` | Date picker field |
| `components/conversations/` | Conversation detail sheet, call audio player, status badge |
| `components/layout/` | Sidebar, header, nav, feedback dialog, filter button, unsaved-changes bar, skeletons |
| `components/onboarding/` | Intro animation sequence |
| `components/voice/` | Call dialog, voice-call hook, voice picker, orb button, Turnstile, AssemblyAI browser client |

---

## Validation

All validation schemas live in `lib/validations/` as Zod schemas:

| File | Validates |
| --- | --- |
| `agent.ts` | Agent creation, settings, scan requests |
| `agent-rule.ts` | Agent rules |
| `assistant.ts` | Assistant requests |
| `auth.ts` | Login, signup forms |
| `availability.ts` | Availability rules |
| `booking.ts` | Public booking, reschedule, cancel |
| `booking-page-config.ts` | Booking page editor config |
| `business.ts` | Business profile |
| `calendar.ts` | Appointments |
| `client.ts` | Client records |
| `conversation.ts` | Conversation data |
| `feedback.ts` | User feedback |
| `integration.ts` | Integration configs |
| `knowledge.ts` | Knowledge sources, FAQs |
| `settings.ts` | Org settings |
| `staff.ts` | Staff records |
| `voice.ts` | Call start/end, AssemblyAI session link, voice tool execution |

Never inline validation in actions or components — always import from these modules.

---

## Testing

- **Framework:** Vitest, `jsdom` environment, `globals: true`, `@` alias → repo root (`vitest.config.ts`)
- **Convention:** test files sit next to the code they test (e.g. `actions.test.ts`, `crawl.test.ts`, `booking-flow.test.tsx`)
- **Run:** `pnpm test` (once) or `pnpm test:watch`; typecheck with `pnpm exec tsc --noEmit`
- **E2E:** Playwright suite under `e2e/` (`pnpm test:e2e`); prerequisites and env-gated specs are in `e2e/README.md`
- `lib/auth/mfa-attempts.test.ts` uses real sockets, never a mocked Redis client: the outage cases (refused port, silent server) and the slow-connect cases (against a minimal in-test RESP server) always run; the Lua-script cases need a disposable Redis at `MFA_REDIS_TEST_URL` (default `redis://127.0.0.1:6379/15`) and skip with that reason when none answers. `.github/workflows/mfa-attempts.yml` runs that one file against a `redis:7-alpine` service on pull requests touching `lib/auth/**`, so those cases run somewhere other than a developer box. Locally, make sure the default URL is a real Redis ≥ 6, not another server that happens to listen on 6379

### Known Baseline (2026-10-08)

- `pnpm exec tsc --noEmit`: clean
- `pnpm test`: 267 passed, 10 failed across 4 files — `app/smb/actions.test.ts`, `lib/data/analytics.test.ts`, `lib/data/availability-engine.test.ts` (date/timezone fixtures), `lib/voice/adapters/fish-audio-tts.test.ts`. All pre-existing.
- `pnpm lint`: 29 errors, 4 warnings, pre-existing. Lint the files you touch with `pnpm exec eslint <files>`.

---

## Docker Setup

### Files

| File | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage: `deps` → `builder` → `runner` (Next.js), `worker` (Alpine), `worker-voice` (Debian/glibc) |
| `docker-compose.yml` | Orchestrates nginx, app, redis, workers |
| `docker/nginx.conf` | Reverse proxy with caching and WebSocket support |
| `.dockerignore` | Excludes node_modules, .next, .env*, .git |

### Services

| Service | Image | Purpose |
| --- | --- | --- |
| `nginx` | `nginx:alpine` | Reverse proxy on port 80 |
| `app` | Built from `runner` target | Next.js standalone server |
| `redis` | `redis:7-alpine` | BullMQ queue backend |
| `worker-jobs` | Built from `worker` target | All BullMQ queues (Alpine) |
| `worker-voice` | Built from `worker-voice` target | Voice agent (Debian — LiveKit needs glibc) |

### Key Details

- `next.config.ts` has `output: "standalone"`; `scripts/prepare-standalone.ts` (postbuild) copies `public/` and `.next/static` into the standalone dir so `pnpm start` works locally
- `NEXT_PUBLIC_*` vars passed as build args (baked into client JS at build time)
- `REDIS_URL` overridden in compose to `redis://redis:6379/0` (containers use Docker DNS, not localhost)
- nginx uses `resolver 127.0.0.11` (Docker DNS) for dynamic upstream resolution
- Static asset caching via `proxy_cache_path` with persistent volume
- Workers run TypeScript directly with `node --import tsx`

### Run

```bash
docker compose --env-file .env.local up --build
```

---

## CI

`.github/workflows/migrations.yml` runs `supabase db push --linked` on pushes to `main` that touch `supabase/migrations/**` or `supabase/config.toml` (also manual dispatch). Requires repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.

`.github/workflows/e2e.yml` runs the Playwright suite on manual dispatch only, with a `redis:7-alpine` service for the MFA spec; see `e2e/README.md`. `.github/workflows/mfa-attempts.yml` ("Auth and MFA") runs the auth suites (`lib/auth/mfa-attempts.test.ts` against a `redis:7-alpine` service, plus `lib/auth/mfa.test.ts`, `lib/auth/recovery.test.ts`, the two `app/(auth)/callback/route*.test.ts` files and `app/(auth)/actions.test.ts`), on pull requests touching `lib/auth/**` or `app/(auth)/**` and on dispatch. There is no full build or Vitest workflow yet: the full suite still carries known failures (see `developer-docs/TODO.md`), so it would not be a usable gate.

---

## Environment Variables

| Variable | Required | Used By | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | App, workers | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | App | Supabase anon key (browser + server reads) |
| `SUPABASE_SECRET_KEY` | Yes | App, workers | Service-role key (bypasses RLS) |
| `NEXT_PUBLIC_SITE_URL` | Yes | App | Base URL, e.g. `http://localhost:3000` |
| `ENCRYPTION_KEY` | For calendar sync | App, workers | Key material for `lib/crypto.ts` (AES-256-GCM OAuth token storage) |
| `REDIS_URL` | Yes | App, workers | Redis connection for BullMQ, and for the TOTP attempt budget on sign-in and password reset. **Redis ≥ 6.0** (the attempt release uses `SET … KEEPTTL`; Compose ships `redis:7-alpine`). If it is unreachable, MFA users cannot complete the code step (fails closed, "temporarily unavailable": within 1s once connected, 3s for a first connect that never completes), on sign-in **and** on password reset, which goes through the same code step; so during an outage an MFA user can neither sign in nor reset a forgotten password, and a reset link spent meanwhile has to be requested again once its 15 minutes pass. Treat a Redis outage as an auth incident. Users without MFA are unaffected |
| `MFA_REDIS_TEST_URL` | No | Vitest only | Disposable Redis for the attempt-budget script tests (default `redis://127.0.0.1:6379/15`); they skip when it is unreachable |
| `WORKER_QUEUES` | No | Jobs worker | Comma-separated subset of queues to run |
| `GROQ_API_KEY` | Yes | App, workers | Groq — STT, conversation LLM, extraction, assistant |
| `GROQ_ASSISTANT_MODEL` | No | App | Model for the in-app assistant |
| `FASTEMBED_MODEL` | No | App, jobs worker, voice worker | Local embedding model (default `bge-small-en-v1.5`) |
| `FASTEMBED_DISABLED` | No | App, workers | `1` = lexical-only knowledge search |
| `LIVEKIT_URL` | Yes | App, voice worker | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | Yes | App, voice worker | LiveKit API key (also verifies webhooks) |
| `LIVEKIT_API_SECRET` | Yes | App, voice worker | LiveKit API secret |
| `SUPABASE_STORAGE_S3_ENDPOINT` / `_REGION` / `_ACCESS_KEY` / `_SECRET_KEY` | For recordings | Voice worker | Supabase Storage S3 credentials for LiveKit egress |
| `FISH_AUDIO_API_KEY` | Yes | Voice worker, app | Fish Audio TTS key (app uses it for custom voice creation) |
| `FISH_AUDIO_TTS_STREAMING` | No | Voice worker | `1` = SSE streaming TTS |
| `ASSEMBLYAI_API_KEY` | For AssemblyAI agents | App, jobs worker | AssemblyAI Voice Agent API key |
| `ASSEMBLYAI_WEBHOOK_SECRET` | No | App | Verifies `session.completed` webhooks; deliveries rejected when unset |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | App | Cloudflare Turnstile (public booking page) |
| `TURNSTILE_SECRET_KEY` | No | App | Turnstile server-side verification |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | No | App | Appointment confirmation email |
| `GOOGLE_CALENDAR_OAUTH_CLIENT_ID` / `_SECRET` | No | App | Google Calendar OAuth |
| `MICROSOFT_CALENDAR_CLIENT_ID` / `_SECRET` | No | App | Microsoft Calendar OAuth |
| `MICROSOFT_CALENDAR_TENANT_ID` | No | App | Defaults to `common` |

`.env.example` also lists `SUPABASE_TOKEN` (Supabase CLI only), `GOOGLE_CALENDAR_WEBHOOK_SECRET`, and `WEBHOOK_SECRET_KEY`; no code reads the last two today.
