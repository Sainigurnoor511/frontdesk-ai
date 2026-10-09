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
│   ├── brand/                  # Logo components (generated dot data)
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

- Supabase Auth handles signup/login (email + Google OAuth), plus TOTP two-factor via `supabase.auth.mfa.*` (enrolled in settings; login-time AAL2 challenge not yet enforced — see `TODO.md`)
- `(auth)/callback/route.ts` handles OAuth callbacks
- Next 16 uses `proxy.ts` (not `middleware.ts`): its `proxy()` calls `updateSession()` from `lib/supabase/middleware.ts`, which calls `supabase.auth.getUser()` to refresh session cookies on every non-static request

### Organization Scoping

Every org-scoped query resolves the caller's org server-side:

```typescript
// lib/data/organization.ts — canonical pattern
const { data: { user } } = await supabase.auth.getUser()
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

44 numbered SQL files in `supabase/migrations/`. Next number: `045`.

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

`lib/queue/connection.ts` — single `ioredis` instance, configured via `REDIS_URL`.

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

Tools are provider-neutral. `lib/voice/tools/*-handlers.ts` define them with `defineVoiceTool` (Zod-validated args); `buildVoiceToolHandlers()` in `lib/voice/tool-handlers.ts` composes them (honoring `skip_knowledge_retrieval`). LiveKit adapts them via `lib/voice/livekit-tool-adapter.ts`; AssemblyAI sends them as `session.tools` and relays calls through `providers/assemblyai/tool-relay.ts`.

Current tools: `check_availability`, `book_appointment`, `search_knowledge`.

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
| `components/brand/` | `<Logo />`, `<LogoMark />`, `<LogoWordmark />` (generated from `brand/tools/`) |
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
- **Playwright** is a devDependency but no E2E suite exists yet

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

`.github/workflows/migrations.yml` runs `supabase db push --linked` on pushes to `main` that touch `supabase/migrations/**` or `supabase/config.toml` (also manual dispatch). Requires repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`. There is no build/test workflow yet.

---

## Environment Variables

| Variable | Required | Used By | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | App, workers | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | App | Supabase anon key (browser + server reads) |
| `SUPABASE_SECRET_KEY` | Yes | App, workers | Service-role key (bypasses RLS) |
| `NEXT_PUBLIC_SITE_URL` | Yes | App | Base URL, e.g. `http://localhost:3000` |
| `ENCRYPTION_KEY` | For calendar sync | App, workers | Key material for `lib/crypto.ts` (AES-256-GCM OAuth token storage) |
| `REDIS_URL` | Yes | App, workers | Redis connection for BullMQ |
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
