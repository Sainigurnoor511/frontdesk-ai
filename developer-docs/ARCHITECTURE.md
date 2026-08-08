# Frontdesk.ai Architecture Guide

A living reference for the project's architecture, patterns, and conventions.

## Index

| Section | Description |
| --- | --- |
| [Architecture Overview](#architecture-overview) | High-level structure and directory layout |
| [Supabase & Database](#supabase--database) | Client layers, auth flow, RLS, migrations |
| [Route Groups & Pages](#route-groups--pages) | App Router layout, server/client split pattern |
| [Server Actions](#server-actions) | Validation, org-scoping, error handling |
| [Data Access Layer](#data-access-layer) | `lib/data/` modules and query conventions |
| [Background Workers](#background-workers) | BullMQ workers, Redis, job lifecycle |
| [Voice Pipeline](#voice-pipeline) | LiveKit call flow, STT/LLM/TTS stack |
| [UI & Components](#ui--components) | shadcn/ui on Base UI, Tailwind v4, Lucide |
| [Validation](#validation) | Zod schemas in `lib/validations/` |
| [Testing](#testing) | Vitest setup, test file conventions |
| [Docker Setup](#docker-setup) | Dockerfile, docker-compose, nginx |
| [Environment Variables](#environment-variables) | All env vars and their purpose |

---

## Architecture Overview

```
frontdesk-ai/
├── app/                    # Next.js 16 App Router
│   ├── (auth)/             # Login, signup, OAuth callback
│   ├── (dashboard)/        # Main app pages (org-scoped)
│   ├── (settings)/         # Organization settings
│   ├── api/                # API routes (assistant streaming)
│   ├── book/[slug]/        # Public booking page
│   └── onboarding/         # Post-signup onboarding wizard
├── components/
│   ├── ui/                 # Vendored shadcn/Base UI primitives
│   ├── agents/             # Agent creation wizard, voice dialogs
│   ├── auth/               # Login/signup forms
│   ├── conversations/      # Conversation status badges
│   ├── layout/             # Sidebar, header, nav
│   ├── onboarding/         # Intro sequence
│   └── voice/              # Call UI, transcript viewer
├── lib/
│   ├── assistant/          # AI assistant (tool-calling agent)
│   ├── crawler/            # Website crawler (robots.txt, fetch, crawl)
│   ├── data/               # Data access layer (Supabase queries)
│   ├── providers/llm/      # LLM provider abstraction (Groq)
│   ├── queue/              # BullMQ queue definitions + Redis connection
│   ├── supabase/           # Supabase client factories (browser, server, service-role)
│   ├── validations/        # Zod schemas for all domains
│   └── voice/              # Voice agent context, rate limiting, TTS adapters
├── workers/                # Standalone Node processes (BullMQ consumers, LiveKit agent)
├── supabase/migrations/    # Numbered SQL migration files
├── docker/                 # nginx.conf for Docker setup
├── public/                 # Static assets, images
└── Dockerfile              # Multi-stage build (runner, worker, worker-voice)
```

---

## Supabase & Database

### Three Client Layers

| Client | File | Auth | RLS | Used By |
| --- | --- | --- | --- | --- |
| Browser | `lib/supabase/client.ts` | Cookie session | Enforced | React components |
| Server | `lib/supabase/server.ts` | Cookie session (via `cookies()`) | Enforced | Server Components, Server Actions |
| Service-role | `lib/supabase/service-role.ts` | `SUPABASE_SECRET_KEY` | Bypassed | Workers, privileged server actions |

**Key design choice:** `service-role.ts` does NOT import `server-only` — this is intentional so standalone workers (which run outside Next.js) can use it. `server.ts` imports `server-only` to prevent client-side leaks.

### Auth Flow

- Supabase Auth handles signup/login (email + Google OAuth)
- `(auth)/callback/route.ts` handles OAuth callbacks
- Session tokens stored in cookies, refreshed by middleware on every request
- `lib/supabase/middleware.ts` → `updateSession()` calls `supabase.auth.getUser()` to refresh tokens

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

**Never use a client-supplied organization ID.** Always resolve via `getCurrentOrgAndUser()`.

### Row-Level Security

All RLS policies follow one pattern:

```sql
organization_id in (
  select organization_id from members where user_id = auth.uid()
)
```

### Migrations

25 numbered SQL files in `supabase/migrations/`. Key tables:

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

Apply with: `npx supabase db push`

---

## Route Groups & Pages

### Layout Groups

| Group | Purpose | Layout |
| --- | --- | --- |
| `(auth)` | Login, signup, OAuth callback | Minimal centered layout |
| `(dashboard)` | All main app pages | Sidebar + header + main content |
| `(settings)` | Organization settings | Settings-specific layout |
| `onboarding` | Post-signup wizard | Standalone flow |
| `book/[slug]` | Public booking page | Public, no auth required |

### Server-Wrapper + Client-Component Pattern

Pages that need both server data and client interactivity split into two files:

```
app/(dashboard)/page.tsx          ← Server Component (fetches data)
app/(dashboard)/home-client.tsx   ← Client Component (renders UI)
```

The server page fetches all data via `lib/data/` modules, then passes it as props to the client component. This pattern is used across all dashboard pages.

---

## Server Actions

Located in `actions.ts` files next to their page. Pattern:

1. **Validate input** with Zod schema from `lib/validations/`
2. **Resolve org** via `getCurrentOrgAndUser()` or `supabase.auth.getUser()`
3. **Perform operation** via Supabase client
4. **Return** typed result or error object

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
| `analytics.ts` | Overview metrics, call stats |
| `availability.ts` | Staff/asset availability |
| `business.ts` | Business profile |
| `calendar.ts` | Appointments |
| `clients.ts` | Client records |
| `conversations.ts` / `conversations-service.ts` | Call transcripts, summaries |
| `integrations.ts` | Org integrations |
| `organization.ts` | Org + user resolution |
| `organization-slug.ts` | Slug generation/validation |
| `settings.ts` | Org settings |
| `sidebar-preferences.ts` | UI preferences |
| `staff.ts` | Staff management |
| `voice-catalog.ts` | Available TTS voices |

Modules ending in `-service.ts` use the service-role client (bypass RLS). Regular modules use the session-scoped server client.

---

## Background Workers

Two standalone Node processes in `workers/`:

### `scan-website.ts` (BullMQ)

- Consumes jobs from `scan-website` queue
- Crawls a URL, extracts business info via Groq LLM
- Updates `agent_scan_jobs` table with results
- Run: `pnpm worker`

### `voice-agent.ts` (LiveKit Agent)

- Registers as a LiveKit agent
- Dispatched into rooms when callers join
- Runs STT → LLM → TTS pipeline
- Writes conversation record on hangup
- Run: `pnpm worker:voice`

### Redis Connection

`lib/queue/connection.ts` — single `ioredis` instance, configured via `REDIS_URL` env var.

---

## Voice Pipeline

No message queue in the call path — direct real-time over LiveKit:

```
Browser → Server Action (mint token, create room) → LiveKit WebRTC
                                                         ↓
                                               voice-agent worker
                                                         ↓
                                          Groq Whisper (STT)
                                                         ↓
                                          Groq LLM (conversation + tools)
                                                         ↓
                                          Fish Audio (TTS)
                                                         ↓
                                               Audio back to browser
```

### Components

| Component | Location |
| --- | --- |
| Call initiation (server actions) | `app/(dashboard)/actions/voice.ts`, `app/book/actions.ts` |
| Voice agent context builder | `lib/voice/agent-context.ts` |
| Fish Audio TTS adapter | `lib/voice/adapters/fish-audio-tts.ts` |
| Rate limiting | `lib/voice/rate-limit.ts` |
| Worker entry point | `workers/voice-agent.ts` |

---

## UI & Components

- **Framework:** shadcn/ui built on `@base-ui/react` (NOT Radix)
- **Composition:** uses `render={<Component />}` pattern (not `asChild`)
- **Icons:** `lucide-react` for all app-level icons
- **Styling:** Tailwind CSS v4

### Component Organization

| Directory | Contents |
| --- | --- |
| `components/ui/` | Vendored shadcn/Base UI primitives (button, dialog, form, etc.) |
| `components/agents/` | Agent creation wizard, voice selection |
| `components/auth/` | Login/signup forms |
| `components/layout/` | Sidebar, header, nav, feedback dialog |
| `components/onboarding/` | Intro animation sequence |
| `components/voice/` | Call UI, transcript viewer |
| `components/conversations/` | Status badges |

---

## Validation

All validation schemas live in `lib/validations/` as Zod schemas:

| File | Validates |
| --- | --- |
| `agent.ts` | Agent creation, scan requests |
| `auth.ts` | Login, signup forms |
| `availability.ts` | Availability rules |
| `business.ts` | Business profile |
| `calendar.ts` | Appointments |
| `client.ts` | Client records |
| `conversation.ts` | Conversation data |
| `feedback.ts` | User feedback |
| `integration.ts` | Integration configs |
| `settings.ts` | Org settings |
| `staff.ts` | Staff records |
| `voice.ts` | Voice/TTS settings |

Never inline validation in actions or components — always import from these modules.

---

## Testing

- **Framework:** Vitest
- **Convention:** test files sit next to the code they test (e.g. `actions.test.ts`, `crawl.test.ts`)
- **Run:** `pnpm test` (once) or `pnpm test:watch`

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
| `worker-scan` | Built from `worker` target | Website scan worker (Alpine) |
| `worker-voice` | Built from `worker-voice` target | Voice agent (Debian — LiveKit needs glibc) |

### Key Details

- `next.config.ts` has `output: "standalone"` for Docker-optimized builds
- `NEXT_PUBLIC_*` vars passed as build args (baked into client JS at build time)
- `REDIS_URL` overridden in compose to `redis://redis:6379/0` (containers use Docker DNS, not localhost)
- nginx uses `resolver 127.0.0.11` (Docker DNS) for dynamic upstream resolution
- Static asset caching via `proxy_cache_path` with persistent volume

### Run

```bash
docker compose --env-file .env.local up --build
```

---

## Environment Variables

| Variable | Required | Used By | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | App, workers | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | App | Supabase anon key (browser + server reads) |
| `SUPABASE_SECRET_KEY` | Yes | App, workers | Service-role key (bypasses RLS) |
| `NEXT_PUBLIC_SITE_URL` | Yes | App | Base URL, e.g. `http://localhost:3000` |
| `REDIS_URL` | Yes | App, workers | Redis connection for BullMQ |
| `GROQ_API_KEY` | Yes | App, workers | Groq API — STT + LLM |
| `GROQ_ASSISTANT_MODEL` | No | App | Model for in-app assistant chatbot |
| `LIVEKIT_URL` | Yes | App, voice worker | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | Yes | App, voice worker | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes | App, voice worker | LiveKit API secret |
| `FISH_AUDIO_API_KEY` | Yes | Voice worker | Fish Audio TTS key |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | App | Cloudflare Turnstile (public booking page) |
| `TURNSTILE_SECRET_KEY` | No | App | Turnstile server-side verification |
