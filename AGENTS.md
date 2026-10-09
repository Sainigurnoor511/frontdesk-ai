# This is NOT the Next.js you know

This version (Next.js 16.4) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices. Example: request interception lives in `proxy.ts` (exported `proxy` function), not `middleware.ts`.

# Frontdesk.ai

Open-source, self-hostable AI receptionist SaaS. Original implementation inspired by products like ElevenLabs' Reception.ai. User-supplied reference markup/screenshots from comparable products (e.g. pasted HTML) may be copied literally — including class names and structure — when the user provides them as a direct reference to match.

Deeper reference: [developer-docs/ARCHITECTURE.md](developer-docs/ARCHITECTURE.md). Backlog: [developer-docs/TODO.md](developer-docs/TODO.md) (team) and [TODO.md](TODO.md) (phase audit).

## Stack

- Next.js 16 App Router, Server Actions, Server Components, React 19, `output: "standalone"`
- Supabase (Postgres + RLS + Storage + Auth/MFA) for auth, orgs, and all persisted data
- BullMQ + Redis for background jobs — one process (`workers/jobs.ts`) hosts every queue
- Voice, two per-agent providers selected by `agents.voice_provider`:
  - `livekit` (default): LiveKit rooms + `@livekit/agents` worker (`workers/voice-agent.ts`) running Groq Whisper STT → Groq LLM → Fish Audio TTS, Silero VAD
  - `assemblyai`: browser talks directly to AssemblyAI's managed Voice Agent WebSocket; tool calls relay through server actions
- Groq for LLM extraction/generation and the in-app assistant (`groq-sdk`)
- FastEmbed (local BGE, 384-dim) + Postgres full-text for hybrid knowledge search
- Resend for email, Cloudflare Turnstile on the public booking page
- Tailwind v4 + shadcn/ui on `@base-ui/react` (not Radix — composition uses `render={<Component />}`, not `asChild`)
- `lucide-react` for all app-level icons (also the icon library vendored shadcn internals already use, so this is consistent throughout)
- Vitest (jsdom, globals) for tests; pnpm for packages

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Next dev server |
| `pnpm build` / `pnpm start` | Production build (postbuild copies `public/` + static into `.next/standalone`) / run it |
| `pnpm dev:jobs` / `pnpm start:jobs` | BullMQ worker for all queues (watch / once). `WORKER_QUEUES=a,b` limits which queues run |
| `pnpm dev:voice` | LiveKit voice worker via the `lk agent dev` CLI (needs `lk` installed) |
| `pnpm start:voice` | LiveKit voice worker in production mode |
| `pnpm test` / `pnpm test:watch` | Vitest |
| `pnpm exec tsc --noEmit` | Typecheck (currently clean — keep it that way) |
| `pnpm exec eslint <files>` | Lint touched files. Full-repo `pnpm lint` carries pre-existing errors, so it is not a usable gate |
| `npx supabase db push` | Apply migrations (CI does this on merge to `main`) |

Known baseline (2026-10-08): `pnpm lint` reports 29 pre-existing errors; `pnpm test` has 4 pre-existing failing files (`app/smb/actions.test.ts`, `lib/data/analytics.test.ts`, `lib/data/availability-engine.test.ts`, `lib/voice/adapters/fish-audio-tts.test.ts`). Compare against this before blaming your change, and update it when you fix one.

## Layout

- `app/(auth)`, `app/(dashboard)`, `app/(settings)`, `app/onboarding` — route groups; `actions.ts` sits next to its page
- `app/smb/[slug]` — public per-org booking page (Turnstile-protected; public calls, booking, manage-booking)
- `app/api/` — assistant streaming, recording playback, calendar OAuth callbacks, LiveKit/AssemblyAI webhooks
- `lib/data/` — data access. `*-service.ts` modules use the service-role client (workers, public paths); the rest use the session client
- `lib/validations/` — Zod schemas; `lib/queue/` — queues (`queues/`), processors (`processors/`), Redis connection
- `lib/voice/` — agent context/prompt, provider-neutral tools (`tools/`), LiveKit adapters, `providers/assemblyai/`
- `lib/integrations/` — Google/Microsoft calendar, Cal.com, Calendly, Twilio/telephony, outbound webhooks
- `lib/knowledge/`, `lib/providers/embedding/`, `lib/crawler/`, `lib/assistant/`, `lib/email/`, `lib/seo/`
- `components/ui/` — vendored shadcn/Base UI primitives; feature components in sibling folders
- `workers/` — standalone Node entry points; `supabase/migrations/` — numbered SQL

## Conventions

- Every `organization_id`-scoped query must resolve the caller's org via `supabase.auth.getUser()` → `members` table lookup (helper: `getCurrentOrgAndUser()` in `lib/data/organization.ts`), never a client-supplied id. Reference: `app/onboarding/actions.ts`'s `createAgent`.
- Validation lives in `lib/validations/*.ts` as Zod schemas, not inline in actions/components. Model-produced tool arguments are Zod-validated too before any write.
- `server-only` must not be imported by any module also consumed outside a Next.js request context (standalone workers, Vitest) — see `lib/supabase/service-role.ts` vs `lib/supabase/server.ts` for the split pattern.
- Migrations are numbered SQL files in `supabase/migrations/` (next is `045`), RLS policies follow the exact `organization_id in (select organization_id from members where user_id = auth.uid())` pattern throughout.
- Server-wrapper + client-component split for any page needing both server-side data fetching and client interactivity (see `app/(dashboard)/page.tsx` + `home-client.tsx`). Each dashboard route also ships a `loading.tsx`.
- New BullMQ queues: define with `lazyQueue()` from `lib/queue/lazy-queue.ts` (no Redis connection at import time), put the handler in `lib/queue/processors/`, and register it in the `QUEUES` list in `workers/jobs.ts`. Never construct a BullMQ `Worker` in `workers/voice-agent.ts` — LiveKit's CLI forks and re-imports that module.
- Voice tools are provider-neutral: add a handler in `lib/voice/tools/*-handlers.ts` (via `defineVoiceTool`) and both providers pick it up through `buildVoiceToolHandlers()` in `lib/voice/tool-handlers.ts`.
- Secrets stored per org (integration tokens) go through `lib/crypto.ts` (AES-256-GCM, `ENCRYPTION_KEY`).
- Brand: render the logo with `<Logo />`, `<LogoMark />` or `<LogoWordmark />` from `components/brand/logo.tsx` (they inherit `currentColor`), never an image file. Logo geometry is generated by `brand/tools/build_logo.py`; don't hand-edit `components/brand/logo-data.ts`.
- UI: Geist is the only UI font. Colours come from tokens in `app/globals.css`; use `success` / `warning` / `danger` (and their `-subtle` backgrounds) for status, never raw Tailwind palette classes like `bg-green-100`. Labels and headings are sentence case. New pages get an entry in `navSections` (`components/layout/app-sidebar.tsx`) so they appear in the sidebar and the Ctrl+K jump menu. Light/dark is driven by `next-themes` (`components/layout/theme-provider.tsx`, mounted in the dashboard and settings layouts only, so the public booking page keeps its own theme); check both modes when adding UI.
- Env vars: add new ones to `.env.example` and the table in `developer-docs/ARCHITECTURE.md`.
- Tests sit next to the code (`*.test.ts(x)`). Actions/data helpers should cover validation failure, success, and org scoping.
