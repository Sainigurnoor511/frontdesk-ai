<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Frontdesk.ai

Open-source, self-hostable AI receptionist SaaS. Original implementation inspired by products like ElevenLabs' Reception.ai. User-supplied reference markup/screenshots from comparable products (e.g. pasted HTML) may be copied literally — including class names and structure — when the user provides them as a direct reference to match.

## Stack

- Next.js 16 App Router, Server Actions, Server Components
- Supabase (Postgres + RLS) for auth, orgs, and all persisted data
- BullMQ + Redis for background jobs (standalone workers in `workers/`, run via `npm run worker`)
- Groq for LLM extraction/generation, Fish Audio for TTS
- Tailwind v4 + shadcn/ui on `@base-ui/react` (not Radix — composition uses `render={<Component />}`, not `asChild`)
- `lucide-react` for all app-level icons (also the icon library vendored shadcn internals already use, so this is consistent throughout)

## Conventions

- Every `organization_id`-scoped query must resolve the caller's org via `supabase.auth.getUser()` → `members` table lookup, never a client-supplied id. Reference: `app/onboarding/actions.ts`'s `createAgent`.
- Validation lives in `lib/validations/*.ts` as Zod schemas, not inline in actions/components.
- `server-only` must not be imported by any module also consumed outside a Next.js request context (standalone workers, Vitest) — see `lib/supabase/service-role.ts` vs `lib/supabase/server.ts` for the split pattern.
- Migrations are numbered SQL files in `supabase/migrations/`, RLS policies follow the exact `organization_id in (select organization_id from members where user_id = auth.uid())` pattern throughout.
- Server-wrapper + client-component split for any page needing both server-side data fetching and client interactivity (see `app/(dashboard)/page.tsx` + `home-client.tsx`).
