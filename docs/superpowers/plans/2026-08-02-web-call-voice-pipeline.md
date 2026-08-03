# Web Call & Voice Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real-time voice call pipeline for FrontDesk.ai — a browser-based "web call" widget (dashboard test button + new public booking page) that connects a caller to the org's AI receptionist over LiveKit, using Groq for STT/LLM and a custom Fish Audio adapter for TTS.

**Architecture:** Browser client (`livekit-client`) joins a LiveKit room via a minted token; a standalone Node worker (`workers/voice-agent.ts`, using `@livekit/agents`) joins the same room as the agent participant and runs Groq Whisper STT (via `@livekit/agents-plugin-openai`'s `.withGroq()`) → Groq LLM with tool-calling → a custom Fish Audio TTS adapter. On call end the worker writes a `Conversation` row via a new service-role-safe data function.

**Tech Stack:** `livekit-client` (browser), `livekit-server-sdk` (token minting), `@livekit/agents` + `@livekit/agents-plugin-openai` (worker), `groq-sdk` (already present), Fish Audio REST/streaming API (custom adapter, no SDK), Supabase (schema + service-role client), BullMQ/ioredis (existing Redis for IP rate limiting), Zod (validation), Next.js Server Actions.

## Global Constraints

- Every `organization_id`-scoped query resolves the caller's org via `supabase.auth.getUser()` → `members` table lookup, never a client-supplied id (dashboard paths only — public paths resolve org via the new `slug` column instead, see Task 2).
- Validation lives in `lib/validations/*.ts` as Zod schemas, not inline in actions/components.
- `server-only` must not be imported by any module also consumed outside a Next.js request context — the worker and its adapters must only import `lib/supabase/service-role.ts`, never `lib/supabase/server.ts`.
- Migrations are numbered SQL files in `supabase/migrations/`, RLS policies follow the exact `organization_id in (select organization_id from members where user_id = auth.uid())` pattern.
- Icons: `@phosphor-icons/react/dist/ssr` for all new app-level icons.
- `@base-ui/react` composition (`render={<Component />}`), not Radix `asChild`.
- No public embed exists yet for the public booking page beyond this plan — this plan builds it from scratch (Task 3).

---

### Task 1: `organizations.slug` column + slug resolution helper

**Files:**
- Create: `supabase/migrations/00000000000015_organization_slug.sql`
- Create: `lib/data/organization-slug.ts`
- Test: `lib/data/organization-slug.test.ts`

**Interfaces:**
- Produces: `slugify(name: string): string` (pure function, url-safe lowercase-dashed), `generateUniqueSlug(supabase: SupabaseClient, name: string): Promise<string>` (appends `-2`, `-3`, ... on collision), `getOrganizationBySlug(slug: string): Promise<{ id: string; name: string } | null>` (service-role lookup, used by the public booking page route in Task 3).

- [ ] **Step 1: Write the migration**

```sql
alter table organizations add column if not exists slug text unique;

create index if not exists organizations_slug_idx on organizations (slug);
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or the project's existing migration-apply command — check `package.json` scripts; if none, run `npx supabase migration up` against the local dev DB)
Expected: migration applies with no errors, `organizations` table now has a nullable unique `slug` column.

- [ ] **Step 3: Write the failing test for `slugify`**

```typescript
// lib/data/organization-slug.test.ts
import { describe, it, expect, vi } from 'vitest'
import { slugify } from './organization-slug'

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Acme Dental Care')).toBe('acme-dental-care')
  })

  it('strips non-alphanumeric characters', () => {
    expect(slugify("Joe's Pizza & Subs!")).toBe('joes-pizza-subs')
  })

  it('trims leading/trailing dashes', () => {
    expect(slugify('  --Weird Name--  ')).toBe('weird-name')
  })

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- lib/data/organization-slug.test.ts`
Expected: FAIL — `organization-slug.ts` doesn't exist yet.

- [ ] **Step 5: Implement `slugify` and the data functions**

```typescript
// lib/data/organization-slug.ts
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SupabaseClient } from '@supabase/supabase-js'

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function generateUniqueSlug(
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const base = slugify(name) || 'business'
  let candidate = base
  let suffix = 2

  while (true) {
    const { data } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()

    if (!data) return candidate
    candidate = `${base}-${suffix}`
    suffix += 1
  }
}

export async function getOrganizationBySlug(
  slug: string
): Promise<{ id: string; name: string } | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()

  return data
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- lib/data/organization-slug.test.ts`
Expected: PASS, all 4 assertions green.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00000000000015_organization_slug.sql lib/data/organization-slug.ts lib/data/organization-slug.test.ts
git commit -m "feat: add organization slug column and resolution helpers"
```

---

### Task 2: Backfill slug on existing orgs + wire into org creation

**Files:**
- Modify: `app/onboarding/actions.ts` (find the `createOrganization`/`createAgent`-adjacent org-creation call)
- Create: `supabase/migrations/00000000000016_backfill_organization_slug.sql`

**Interfaces:**
- Consumes: `generateUniqueSlug` and `slugify` from Task 1 (`lib/data/organization-slug.ts`).

- [ ] **Step 1: Read the onboarding org-creation flow**

Run a read of `app/onboarding/actions.ts` to find exactly where an `organizations` row is inserted (look for `.from('organizations').insert(`). Note the variable holding the org name at that point.

- [ ] **Step 2: Write the backfill migration**

This is a data migration (PL/pgSQL), not a schema change — write it directly since it has no meaningful "failing test" (it's a one-time backfill against existing rows):

```sql
do $$
declare
  org record;
  base_slug text;
  candidate_slug text;
  suffix int;
begin
  for org in select id, name from organizations where slug is null loop
    base_slug := lower(trim(regexp_replace(org.name, '[^a-zA-Z0-9]+', '-', 'g')));
    base_slug := trim(both '-' from base_slug);
    if base_slug = '' then
      base_slug := 'business';
    end if;

    candidate_slug := base_slug;
    suffix := 2;

    while exists (select 1 from organizations where slug = candidate_slug) loop
      candidate_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    end loop;

    update organizations set slug = candidate_slug where id = org.id;
  end loop;
end $$;
```

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`
Expected: all existing `organizations` rows now have a non-null, unique `slug`.

- [ ] **Step 4: Wire slug generation into org creation**

In `app/onboarding/actions.ts`, right before (or as part of) the `.from('organizations').insert(...)` call, generate the slug and include it in the insert payload:

```typescript
import { generateUniqueSlug } from '@/lib/data/organization-slug'

// ...inside the existing org-creation function, before the insert:
const slug = await generateUniqueSlug(supabase, organizationName)

const { data: org, error } = await supabase
  .from('organizations')
  .insert({ name: organizationName, slug })
  .select('id, name, slug')
  .single()
```

Adjust variable names to match whatever the existing function already calls the org name and Supabase client — do not rename existing variables, just add the `slug` field to the existing insert payload.

- [ ] **Step 5: Verify manually**

Run: `npm run dev`, complete onboarding as a fresh test org, then check in Supabase Studio (or `psql`) that the new `organizations` row has a populated `slug`.
Expected: slug present, url-safe, unique.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00000000000016_backfill_organization_slug.sql app/onboarding/actions.ts
git commit -m "feat: backfill organization slugs and generate on org creation"
```

---

### Task 3: Public booking page route (`/book/[slug]`)

**Files:**
- Create: `app/book/[slug]/page.tsx`
- Create: `app/book/[slug]/booking-page-public-client.tsx`
- Create: `app/book/[slug]/not-found.tsx`

**Interfaces:**
- Consumes: `getOrganizationBySlug` (Task 1), `getOrganizationSettings(organizationId)` and `getServices(organizationId)` (existing, `lib/data/settings.ts` / `lib/data/business.ts` — both currently call `createClient()` session-based; this task calls them from a route that has no logged-in user, see Step 2 note below), `getAgentsForOrg(organizationId)` (existing, `lib/data/agents.ts`).
- Produces: the public route that Task 6's `CallDialog` gets embedded into via a `organizationId` + `agentId` prop pair.

- [ ] **Step 1: Confirm the read functions work without a session**

`getOrganizationSettings` and `getServices` (in `lib/data/settings.ts` / `lib/data/business.ts`) currently call `await createClient()` from `lib/supabase/server.ts` and don't gate on `auth.getUser()` before querying — re-read both files to confirm they accept an explicit `organizationId` param (they do, per the signatures seen during investigation: `getOrganizationSettings(organizationId)`, `getServices(organizationId)`). Since they take an explicit id and don't check `auth.getUser()` internally, they should work for anonymous callers **only if** the `organization_settings`/`services` RLS policies allow anonymous `select`. Check `supabase/migrations/00000000000012_organization_settings.sql` and the services migration for a `select` policy scoped to `auth.uid()` membership only.

If the existing `select` policies are member-only (expected, per the "every RLS policy follows the members pattern" convention), anonymous public reads will return empty results silently (RLS just filters rows, doesn't error). In that case, add a new migration:

```sql
-- supabase/migrations/00000000000017_public_booking_page_read_access.sql
create policy "Public can view booking-page-enabled organization settings"
  on organization_settings for select
  using (booking_page_enabled = true);

create policy "Public can view bookable services"
  on services for select
  using (show_on_booking_page = true);
```

Only add this migration if Step 1's investigation confirms the existing policies are member-only — check first, don't add redundant policies if a public-read policy already exists.

- [ ] **Step 2: Write the page (server component)**

```typescript
// app/book/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { getOrganizationBySlug } from '@/lib/data/organization-slug'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getServices } from '@/lib/data/business'
import { getAgentsForOrg } from '@/lib/data/agents'
import { BookingPagePublicClient } from './booking-page-public-client'

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const org = await getOrganizationBySlug(slug)
  if (!org) notFound()

  const [settings, services, agents] = await Promise.all([
    getOrganizationSettings(org.id),
    getServices(org.id),
    getAgentsForOrg(org.id),
  ])

  if (!settings.bookingPageEnabled) notFound()

  const agent = agents[0] ?? null

  return (
    <BookingPagePublicClient
      organizationId={org.id}
      organizationName={org.name}
      services={services.filter((s) => s.showOnBookingPage)}
      agentId={agent?.id ?? null}
      agentName={agent ? (agent.business_name ?? agent.name) : org.name}
    />
  )
}
```

- [ ] **Step 3: Write the not-found fallback**

```typescript
// app/book/[slug]/not-found.tsx
export default function BookingPageNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold">Booking page not found</h1>
      <p className="text-sm text-muted-foreground">
        This link may be incorrect, or the business hasn&apos;t enabled online booking.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Write the minimal public client component**

```typescript
// app/book/[slug]/booking-page-public-client.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Phone } from '@phosphor-icons/react/dist/ssr'
import type { Service } from '@/lib/data/business'
import { CallDialog } from '@/components/voice/call-dialog'

function formatPrice(price: number) {
  return `$${price.toFixed(2)}`
}

export function BookingPagePublicClient({
  organizationId,
  organizationName,
  services,
  agentId,
  agentName,
}: {
  organizationId: string
  organizationName: string
  services: Service[]
  agentId: string | null
  agentName: string
}) {
  const [callOpen, setCallOpen] = useState(false)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">{organizationName}</h1>
        <p className="text-sm text-muted-foreground">Book an appointment or talk to our receptionist.</p>
      </div>

      {agentId && (
        <div className="flex justify-center">
          <Button onClick={() => setCallOpen(true)} className="gap-1.5">
            <Phone />
            Talk to {agentName}
          </Button>
        </div>
      )}

      {services.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {services.map((service) => (
              <div key={service.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{service.name}</p>
                  <p className="text-xs text-muted-foreground">{service.durationMinutes} min</p>
                </div>
                <p className="text-sm font-medium">{formatPrice(service.price)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {agentId && (
        <CallDialog
          open={callOpen}
          onOpenChange={setCallOpen}
          organizationId={organizationId}
          agentId={agentId}
          agentName={agentName}
          authenticated={false}
        />
      )}
    </div>
  )
}
```

Note: `CallDialog` is built in Task 6 — this task references it but the import will fail until Task 6 lands. That's expected; Task 3 and Task 6 are sequenced so Task 6 comes right after.

- [ ] **Step 5: Verify manually (after Task 6 lands — revisit this step then)**

Run: `npm run dev`, visit `/book/<a-real-slug-from-your-dev-db>`.
Expected: page renders business name, services, and a "Talk to X" button (dialog won't fully work until later tasks complete the pipeline — at this point it's fine if clicking it errors, that's Task 6+).

- [ ] **Step 6: Commit**

```bash
git add app/book
git commit -m "feat: add public booking page route"
```

---

### Task 4: `conversations` write path + call status tracking columns

**Files:**
- Create: `supabase/migrations/00000000000018_conversation_call_status.sql`
- Modify: `lib/data/conversations.ts`
- Test: `lib/data/conversations.test.ts`

**Interfaces:**
- Produces: `createConversation(input: CreateConversationInput): Promise<Conversation>` where `CreateConversationInput = { organizationId: string; agentId: string | null; channel: 'voice_web'; status: 'active' }`. Uses service-role client (this function is called from the worker, not a session context) — takes an explicit `organizationId` param rather than resolving it from `auth.getUser()`. `updateConversationStatus(id: string, patch: { status?: 'active' | 'completed' | 'failed'; outcome?: 'successful' | 'failed'; summary?: string; durationSeconds?: number; endedReason?: string; transcript?: TranscriptMessage[] }): Promise<void>`.

- [ ] **Step 1: Write the migration**

```sql
alter table conversations add column if not exists status text not null default 'completed'
  check (status in ('active', 'completed', 'failed'));

alter table conversations add column if not exists started_at timestamptz not null default now();

create policy "Service role can manage all conversations"
  on conversations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
```

Note: the service-role Supabase client (using the secret key) bypasses RLS entirely by design, so the last policy is defense-in-documentation rather than a functional requirement — Supabase's service role always bypasses RLS. Keep it for clarity but don't rely on it; the actual bypass comes from using `createServiceRoleClient()`.

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: `conversations` has new `status` and `started_at` columns, existing rows default to `status = 'completed'`.

- [ ] **Step 3: Write the failing test**

```typescript
// lib/data/conversations.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createConversation } from './conversations'

describe('createConversation', () => {
  it('inserts a conversation row with status active and returns it mapped', async () => {
    const mockRow = {
      id: 'conv-1',
      organization_id: 'org-1',
      agent_id: 'agent-1',
      channel: 'voice_web',
      outcome: 'successful',
      category: null,
      summary: null,
      duration_seconds: 0,
      ended_reason: null,
      transcript: [],
      call_goals: [],
      created_at: '2026-08-02T00:00:00Z',
    }

    const single = vi.fn().mockResolvedValue({ data: mockRow, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from } as never)

    const result = await createConversation({
      organizationId: 'org-1',
      agentId: 'agent-1',
      channel: 'voice_web',
      status: 'active',
    })

    expect(from).toHaveBeenCalledWith('conversations')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        agent_id: 'agent-1',
        channel: 'voice_web',
        status: 'active',
      })
    )
    expect(result.id).toBe('conv-1')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- lib/data/conversations.test.ts`
Expected: FAIL — `createConversation` is not exported yet.

- [ ] **Step 5: Implement `createConversation` and `updateConversationStatus`**

Add to the bottom of `lib/data/conversations.ts` (keep all existing exports untouched):

```typescript
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type CreateConversationInput = {
  organizationId: string
  agentId: string | null
  channel: 'voice_web' | 'phone' | 'chat'
  status: 'active'
}

export async function createConversation(
  input: CreateConversationInput
): Promise<Conversation> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      organization_id: input.organizationId,
      agent_id: input.agentId,
      channel: input.channel,
      status: input.status,
    })
    .select(CONVERSATION_COLUMNS)
    .single()

  if (error || !data) {
    throw new Error(`Failed to create conversation: ${error?.message ?? 'unknown error'}`)
  }

  return mapConversation(data as ConversationRow)
}

export async function updateConversationStatus(
  id: string,
  patch: {
    status?: 'active' | 'completed' | 'failed'
    outcome?: 'successful' | 'failed'
    summary?: string
    durationSeconds?: number
    endedReason?: string
    transcript?: TranscriptMessage[]
  }
): Promise<void> {
  const supabase = createServiceRoleClient()
  const update: Record<string, unknown> = {}
  if (patch.status !== undefined) update.status = patch.status
  if (patch.outcome !== undefined) update.outcome = patch.outcome
  if (patch.summary !== undefined) update.summary = patch.summary
  if (patch.durationSeconds !== undefined) update.duration_seconds = patch.durationSeconds
  if (patch.endedReason !== undefined) update.ended_reason = patch.endedReason
  if (patch.transcript !== undefined) update.transcript = patch.transcript

  const { error } = await supabase.from('conversations').update(update).eq('id', id)
  if (error) {
    throw new Error(`Failed to update conversation ${id}: ${error.message}`)
  }
}
```

Note: this file (`lib/data/conversations.ts`) is imported by dashboard server components today via `createClient` from `lib/supabase/server.ts` (which has an implicit `server-only` import per AGENTS.md's convention). Since this file will now be imported by the standalone worker too (Task 8), and mixing a `server-only`-tainted module into a worker import graph breaks it, verify: does `lib/supabase/server.ts` itself import `server-only`? If yes, this file is fine as long as `createConversation`/`updateConversationStatus` only ever call `createServiceRoleClient` (not `createClient`) — but the file-level import of `createClient` from `server.ts` at the top still taints the whole module for bundlers that respect `server-only`. To be safe, do NOT import this shared file from the worker — instead see Task 8, which calls these two functions via a separate re-export path if this turns out to be a problem in practice (verify via Step 6 below before deciding).

- [ ] **Step 6: Verify the module is safely importable from a non-Next context**

Run: `npx tsx -e "require('./lib/data/conversations.ts')"` (or write a 2-line throwaway script in the scratchpad dir that imports `createConversation` from `lib/data/conversations` and calls `console.log(typeof createConversation)`) outside of `next dev`.
Expected: no `server-only` runtime error. If it DOES throw a `server-only` import error, split the two new functions into a new file `lib/data/conversations-service.ts` that imports only `createServiceRoleClient` (no `lib/supabase/server.ts` import at all), re-export the shared types (`Conversation`, `TranscriptMessage`, etc.) from there instead of duplicating them, and update Task 8's worker to import from `conversations-service.ts` instead.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test -- lib/data/conversations.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/00000000000018_conversation_call_status.sql lib/data/conversations.ts lib/data/conversations.test.ts
git commit -m "feat: add conversation write path for live call pipeline"
```

---

### Task 5: LiveKit token minting server action + IP rate limiting

**Files:**
- Create: `lib/voice/rate-limit.ts`
- Create: `lib/validations/voice.ts`
- Create: `app/(dashboard)/actions/voice.ts`
- Create: `app/book/actions.ts`
- Test: `lib/voice/rate-limit.test.ts`

**Interfaces:**
- Produces: `checkAndConsumeRateLimit(key: string, opts: { max: number; windowSeconds: number }): Promise<{ allowed: boolean; remaining: number }>` (Task 5), `startDashboardCall(input: { agentId: string }): Promise<{ error: string } | { token: string; url: string; roomName: string; conversationId: string }>` (dashboard-authenticated, resolves org via session), `startPublicCall(input: { organizationId: string; agentId: string }): Promise<{ error: string } | { token: string; url: string; roomName: string; conversationId: string }>` (public, rate-limited by caller IP).
- Consumes: `createConversation` (Task 4), `generateUniqueSlug`-adjacent env access, `redisConnection` from `lib/queue/connection.ts` (existing).

- [ ] **Step 1: Check existing Redis connection export**

Read `lib/queue/connection.ts` to confirm the exact export name and shape (`redisConnection`) used by `workers/scan-website.ts` — reuse the same instance/module rather than creating a second Redis client.

- [ ] **Step 2: Write the failing test for rate limiting**

```typescript
// lib/voice/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map<string, number>()

vi.mock('@/lib/queue/connection', () => ({
  redisConnection: {
    incr: vi.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1
      store.set(key, next)
      return next
    }),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => 3600),
  },
}))

import { checkAndConsumeRateLimit } from './rate-limit'

beforeEach(() => store.clear())

describe('checkAndConsumeRateLimit', () => {
  it('allows requests under the max', async () => {
    const result = await checkAndConsumeRateLimit('ip:1.2.3.4', { max: 3, windowSeconds: 3600 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('blocks requests once max is reached', async () => {
    await checkAndConsumeRateLimit('ip:1.2.3.4', { max: 2, windowSeconds: 3600 })
    await checkAndConsumeRateLimit('ip:1.2.3.4', { max: 2, windowSeconds: 3600 })
    const third = await checkAndConsumeRateLimit('ip:1.2.3.4', { max: 2, windowSeconds: 3600 })
    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- lib/voice/rate-limit.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement rate limiting**

```typescript
// lib/voice/rate-limit.ts
import { redisConnection } from '@/lib/queue/connection'

export async function checkAndConsumeRateLimit(
  key: string,
  opts: { max: number; windowSeconds: number }
): Promise<{ allowed: boolean; remaining: number }> {
  const count = await redisConnection.incr(key)
  if (count === 1) {
    await redisConnection.expire(key, opts.windowSeconds)
  }

  const remaining = Math.max(0, opts.max - count)
  return { allowed: count <= opts.max, remaining }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- lib/voice/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the Zod validation schemas**

```typescript
// lib/validations/voice.ts
import { z } from 'zod'

export const startDashboardCallSchema = z.object({
  agentId: z.string().uuid(),
})

export const startPublicCallSchema = z.object({
  organizationId: z.string().uuid(),
  agentId: z.string().uuid(),
})

export type StartDashboardCallInput = z.infer<typeof startDashboardCallSchema>
export type StartPublicCallInput = z.infer<typeof startPublicCallSchema>
```

- [ ] **Step 7: Implement the dashboard-authenticated server action**

```typescript
// app/(dashboard)/actions/voice.ts
'use server'

import { AccessToken } from 'livekit-server-sdk'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createConversation } from '@/lib/data/conversations'
import { startDashboardCallSchema, type StartDashboardCallInput } from '@/lib/validations/voice'

const MAX_CALL_SECONDS = 300

export async function startDashboardCall(
  input: StartDashboardCallInput
): Promise<{ error: string } | { token: string; url: string; roomName: string; conversationId: string }> {
  const parsed = startDashboardCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to start a call.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const roomName = `${member.organization_id}:call:${crypto.randomUUID()}`
  const conversation = await createConversation({
    organizationId: member.organization_id,
    agentId: parsed.data.agentId,
    channel: 'voice_web',
    status: 'active',
  })

  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: `dashboard-${user.id}`,
    ttl: MAX_CALL_SECONDS,
  })
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true })

  return {
    token: await at.toJwt(),
    url: process.env.LIVEKIT_URL!,
    roomName,
    conversationId: conversation.id,
  }
}
```

- [ ] **Step 8: Implement the public rate-limited server action**

```typescript
// app/book/actions.ts
'use server'

import { AccessToken } from 'livekit-server-sdk'
import { headers } from 'next/headers'
import { createConversation } from '@/lib/data/conversations'
import { checkAndConsumeRateLimit } from '@/lib/voice/rate-limit'
import { startPublicCallSchema, type StartPublicCallInput } from '@/lib/validations/voice'

const MAX_CALL_SECONDS = 300
const MAX_CALLS_PER_HOUR_PER_IP = 5

export async function startPublicCall(
  input: StartPublicCallInput
): Promise<{ error: string } | { token: string; url: string; roomName: string; conversationId: string }> {
  const parsed = startPublicCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'

  const rateLimit = await checkAndConsumeRateLimit(`voice-call:${ip}`, {
    max: MAX_CALLS_PER_HOUR_PER_IP,
    windowSeconds: 3600,
  })

  if (!rateLimit.allowed) {
    return { error: 'Too many calls from this network. Please try again later.' }
  }

  const roomName = `${parsed.data.organizationId}:call:${crypto.randomUUID()}`
  const conversation = await createConversation({
    organizationId: parsed.data.organizationId,
    agentId: parsed.data.agentId,
    channel: 'voice_web',
    status: 'active',
  })

  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: `public-${ip}-${crypto.randomUUID()}`,
    ttl: MAX_CALL_SECONDS,
  })
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true })

  return {
    token: await at.toJwt(),
    url: process.env.LIVEKIT_URL!,
    roomName,
    conversationId: conversation.id,
  }
}
```

- [ ] **Step 9: Install `livekit-server-sdk` and `livekit-client`**

Run: `npm install livekit-server-sdk livekit-client`
Expected: both added to `package.json` dependencies.

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by these two files (pre-existing unrelated errors, if any, are not this task's concern).

- [ ] **Step 11: Commit**

```bash
git add lib/voice/rate-limit.ts lib/voice/rate-limit.test.ts lib/validations/voice.ts "app/(dashboard)/actions/voice.ts" app/book/actions.ts package.json package-lock.json
git commit -m "feat: add LiveKit token minting with dashboard auth and public rate limiting"
```

---

### Task 6: `CallDialog` client component + Orb integration

**Files:**
- Create: `components/voice/call-dialog.tsx`
- Create: `components/voice/use-voice-call.ts`

**Interfaces:**
- Consumes: `startDashboardCall` (Task 5, dashboard path) or `startPublicCall` (Task 5, public path) depending on `authenticated` prop; `Orb` and `AgentState` from `@/components/ui/orb` (existing); `livekit-client`'s `Room`, `RoomEvent`, `Track`.
- Produces: `<CallDialog open agentId agentName organizationId authenticated onOpenChange />` used by Task 3's public page and Task 7's dashboard triggers.

- [ ] **Step 1: Write the `useVoiceCall` hook**

```typescript
// components/voice/use-voice-call.ts
'use client'

import { useCallback, useRef, useState } from 'react'
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client'
import type { AgentState } from '@/components/ui/orb'

type CallStatus = 'idle' | 'connecting' | 'connected' | 'ended' | 'error'

export function useVoiceCall(startCall: () => Promise<
  { error: string } | { token: string; url: string; roomName: string; conversationId: string }
>) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const roomRef = useRef<Room | null>(null)

  const connect = useCallback(async () => {
    setStatus('connecting')
    setErrorMessage(null)

    const result = await startCall()
    if ('error' in result) {
      setStatus('error')
      setErrorMessage(result.error)
      return
    }

    const room = new Room()
    roomRef.current = room

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach()
        el.autoplay = true
        document.body.appendChild(el)
      }
      setAgentState('talking')
    })

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setAgentState(speakers.length > 0 ? 'talking' : 'listening')
    })

    room.on(RoomEvent.Disconnected, () => {
      setStatus('ended')
      setAgentState(null)
    })

    try {
      await room.connect(result.url, result.token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setStatus('connected')
      setAgentState('listening')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Could not connect to the call.')
    }
  }, [startCall])

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect()
    roomRef.current = null
    setStatus('ended')
    setAgentState(null)
  }, [])

  return { status, agentState, errorMessage, connect, disconnect }
}
```

- [ ] **Step 2: Write the `CallDialog` component**

```typescript
// components/voice/call-dialog.tsx
'use client'

import { Phone, X } from '@phosphor-icons/react/dist/ssr'
import { Orb } from '@/components/ui/orb'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useVoiceCall } from './use-voice-call'
import { startDashboardCall } from '@/app/(dashboard)/actions/voice'
import { startPublicCall } from '@/app/book/actions'

export function CallDialog({
  open,
  onOpenChange,
  organizationId,
  agentId,
  agentName,
  staffPhoneNumber,
  authenticated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  agentId: string
  agentName: string
  staffPhoneNumber?: string | null
  authenticated: boolean
}) {
  const { status, agentState, errorMessage, connect, disconnect } = useVoiceCall(() =>
    authenticated
      ? startDashboardCall({ agentId })
      : startPublicCall({ organizationId, agentId })
  )

  function handleOpenChange(next: boolean) {
    if (!next) disconnect()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{agentName}</DialogTitle>
          <DialogDescription>Start a call to your receptionist</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="size-32 overflow-hidden rounded-full">
            <Orb agentState={agentState} colors={['#DCE9FF', '#B9D3FF']} seed={1} />
          </div>

          {status === 'idle' || status === 'error' ? (
            <Button onClick={connect} className="gap-1.5">
              <Phone />
              {status === 'error' ? 'Try again' : 'Start call'}
            </Button>
          ) : status === 'connecting' ? (
            <p className="text-sm text-muted-foreground">Connecting…</p>
          ) : status === 'connected' ? (
            <Button onClick={disconnect} variant="destructive" className="gap-1.5">
              <X />
              End call
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Call ended</p>
          )}

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

          {staffPhoneNumber && (
            <p className="text-sm text-muted-foreground">Or call {staffPhoneNumber}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Confirm `Dialog` primitives exist**

Read `components/ui/dialog.tsx` to confirm the exact export names (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`) match shadcn/base-ui conventions already in the codebase — adjust the import/usage in Step 2 if names differ (e.g. if `DialogDescription` isn't exported, drop that line rather than inventing a prop that doesn't exist).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. Fix any prop-shape mismatches against the real `Orb` and `Dialog` component signatures found in Step 3.

- [ ] **Step 5: Commit**

```bash
git add components/voice
git commit -m "feat: add CallDialog component with LiveKit connection and Orb state binding"
```

---

### Task 7: Wire dashboard triggers (Home "Test it" + sidebar)

**Files:**
- Modify: `app/(dashboard)/home-client.tsx:1-20,90-162` (imports + status banner button)
- Modify: `components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: `CallDialog` (Task 6).

- [ ] **Step 1: Wire the Home "Test it" button**

In `app/(dashboard)/home-client.tsx`, add `import { CallDialog } from '@/components/voice/call-dialog'` near the other imports, add `const [callOpen, setCallOpen] = useState(false)` alongside the existing `dismissed` state, and change the disabled "Test it" `Button` (around line 156-159) to:

```typescript
<Button
  size="sm"
  variant="outline"
  disabled={!agent}
  className="gap-1.5"
  onClick={() => setCallOpen(true)}
>
  <Phone />
  Test it
</Button>
{agent && (
  <CallDialog
    open={callOpen}
    onOpenChange={setCallOpen}
    organizationId={agent.organization_id}
    agentId={agent.id}
    agentName={agent.business_name ?? agent.name}
    staffPhoneNumber={agent.staff_phone_number}
    authenticated
  />
)}
```

Note: the `Agent` type in `lib/data/agents.ts` (the narrow one used by `getAgentsForOrg`, which is what `HomeClient`'s `agent` prop is typed as per the existing import) does **not** currently include `organization_id` — only `AgentDetail` does. Check `app/(dashboard)/page.tsx` (the server wrapper) to see which one it actually passes down. If it's the narrow `Agent` type, either widen `lib/data/agents.ts`'s `Agent` type to include `organization_id` (it's a real column, safe to add to the select), or resolve `organizationId` a different way — do not fabricate a value. Prefer widening the type and the `AGENT_DETAIL_COLUMNS`-adjacent select in `getAgentsForOrg` to include `organization_id`, since that's the smallest, most honest fix.

- [ ] **Step 2: Add a sidebar call trigger**

In `components/layout/app-sidebar.tsx`, add a new button near the top of the sidebar (matching the reference screenshot's popup trigger). This needs the current org's agent — check how `AppSidebar` currently receives org/agent data (it takes `orgName` per its existing signature) and whether agent data is available there or needs a new prop threaded from the server layout. If `AppSidebar` doesn't currently receive agent data, add an `agent: { id: string; name: string; staffPhoneNumber: string | null } | null` prop, thread it from wherever `<AppSidebar orgName={...} />` is rendered (find via grep for `<AppSidebar`), sourcing it the same way the dashboard page already fetches the org's agent for `HomeClient`.

Add the trigger button (e.g. near `PhoneNumberPill`, inside `SidebarHeader` or as a new `SidebarMenuItem`):

```typescript
import { CallDialog } from '@/components/voice/call-dialog'

// inside AppSidebar component body:
const [callOpen, setCallOpen] = useState(false)

// JSX, placed near the top nav items:
{agent && (
  <>
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => setCallOpen(true)}>
        <Phone />
        <span>Call receptionist</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
    <CallDialog
      open={callOpen}
      onOpenChange={setCallOpen}
      organizationId={agent.organizationId}
      agentId={agent.id}
      agentName={agent.name}
      staffPhoneNumber={agent.staffPhoneNumber}
      authenticated
    />
  </>
)}
```

Adjust to match whatever prop-threading pattern the rest of `AppSidebar`'s data (like `orgName`) already uses — follow the existing convention rather than inventing a new one.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in, go to Home — click "Test it" (should open the dialog with the Orb visible, "Start call" button present even though connecting will fail until Task 8's worker exists — that's expected at this point). Same check from the sidebar trigger.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/home-client.tsx" components/layout/app-sidebar.tsx
git commit -m "feat: wire dashboard call triggers to CallDialog"
```

---

### Task 8: Fish Audio TTS adapter

**Files:**
- Create: `lib/voice/adapters/fish-audio-tts.ts`
- Test: `lib/voice/adapters/fish-audio-tts.test.ts`

**Interfaces:**
- Produces: `class FishAudioTTS extends tts.TTS` implementing LiveKit Agents' TTS plugin interface (`@livekit/agents`'s `tts` module), consumed by Task 9's worker.
- Consumes: `FISH_AUDIO_API_KEY` env var.

- [ ] **Step 1: Install `@livekit/agents` and `@livekit/agents-plugin-openai`**

Run: `npm install @livekit/agents @livekit/agents-plugin-openai`
Expected: both added to `package.json`.

- [ ] **Step 2: Read the LiveKit Agents `tts.TTS` base class shape**

Run: `npx tsc --noEmit` won't help here — instead read `node_modules/@livekit/agents/dist/tts/tts.d.ts` (or the equivalent path — check `node_modules/@livekit/agents/dist` structure first) to get the exact abstract methods/constructor signature required (typically: a `synthesize(text: string): SynthesizeStream` method and a capabilities descriptor in the constructor). Do not guess the shape — copy the real interface from the installed package's type definitions.

- [ ] **Step 3: Write the failing test**

```typescript
// lib/voice/adapters/fish-audio-tts.test.ts
import { describe, it, expect, vi } from 'vitest'

global.fetch = vi.fn()

import { synthesizeSpeech } from './fish-audio-tts'

describe('synthesizeSpeech', () => {
  it('calls Fish Audio API with the given text and returns an audio stream', async () => {
    const mockBody = new ReadableStream()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: mockBody,
    } as Response)

    const result = await synthesizeSpeech('Hello, how can I help you?')

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('fish.audio'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toBe(mockBody)
  })

  it('throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(synthesizeSpeech('test')).rejects.toThrow()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- lib/voice/adapters/fish-audio-tts.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 5: Implement the low-level `synthesizeSpeech` fetch wrapper first**

Write the plain fetch-based function against Fish Audio's REST TTS endpoint (`https://api.fish.audio/v1/tts`, per Fish Audio's public API docs — confirm exact path/payload shape against their docs if available; use the `msgpack`-or-`json` content-type they document, defaulting to JSON if uncertain):

```typescript
// lib/voice/adapters/fish-audio-tts.ts
export async function synthesizeSpeech(text: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, format: 'pcm', sample_rate: 24000 }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Fish Audio TTS request failed: ${response.status}`)
  }

  return response.body
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- lib/voice/adapters/fish-audio-tts.test.ts`
Expected: PASS.

- [ ] **Step 7: Wrap `synthesizeSpeech` in the LiveKit `tts.TTS` subclass**

Using the exact base-class shape found in Step 2, add a class below `synthesizeSpeech` in the same file:

```typescript
import { tts } from '@livekit/agents'

export class FishAudioTTS extends tts.TTS {
  constructor() {
    super({ streaming: false }, { sampleRate: 24000, numChannels: 1 })
  }

  synthesize(text: string) {
    return new FishAudioSynthesizeStream(this, text)
  }
}

class FishAudioSynthesizeStream extends tts.SynthesizeStream {
  constructor(
    private readonly ttsInstance: FishAudioTTS,
    private readonly text: string
  ) {
    super(ttsInstance)
  }

  protected async run() {
    const stream = await synthesizeSpeech(this.text)
    const reader = stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      this.queue.put(value)
    }
    this.queue.close()
  }
}
```

This is a best-effort shape based on typical LiveKit Agents plugin structure — Step 2's actual type definitions are authoritative. Adjust method names (`run`, `queue.put`, `queue.close`, constructor args) to match exactly what the installed `@livekit/agents` version requires; if the abstract class shape differs meaningfully, prioritize matching it over this snippet.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: `FishAudioTTS` correctly implements the abstract `tts.TTS` class with no missing-method errors.

- [ ] **Step 9: Commit**

```bash
git add lib/voice/adapters/fish-audio-tts.ts lib/voice/adapters/fish-audio-tts.test.ts package.json package-lock.json
git commit -m "feat: add Fish Audio TTS adapter for LiveKit Agents"
```

---

### Task 9: Voice agent worker (`workers/voice-agent.ts`)

**Files:**
- Create: `workers/voice-agent.ts`
- Create: `lib/voice/agent-context.ts`
- Modify: `package.json` (add `worker:voice` script)

**Interfaces:**
- Consumes: `FishAudioTTS` (Task 8), `openai.STT.withGroq` from `@livekit/agents-plugin-openai`, `createConversation`/`updateConversationStatus` (Task 4, or `conversations-service.ts` if Task 4 Step 6 required the split), `getAgentById` (existing, `lib/data/agents.ts` — note: this also goes through `lib/supabase/server.ts`, apply the same server-only safety check as Task 4 Step 6; if tainted, add a service-role variant `getAgentByIdServiceRole` alongside it).
- Produces: a long-running process, started via `npm run worker:voice`, that joins any LiveKit room it's dispatched to and runs the full STT→LLM→TTS pipeline.

- [ ] **Step 1: Read `@livekit/agents`' worker/job entrypoint shape**

Read `node_modules/@livekit/agents/dist/index.d.ts` (or wherever the package's main types live) to find the exact `WorkerOptions`, `defineAgent`/`Agent` job-entry function signature, and how a job's `ctx.room` is exposed. This SDK's API surface is the authority — do not guess.

- [ ] **Step 2: Write `lib/voice/agent-context.ts` — builds the system prompt + tool definitions from an `AgentDetail`**

```typescript
// lib/voice/agent-context.ts
import type { AgentDetail } from '@/lib/data/agents'

export function buildSystemPrompt(agent: AgentDetail): string {
  const parts = [
    agent.greeting_prompt ?? `You are the AI receptionist for ${agent.business_name ?? agent.name}.`,
    agent.personality_notes ? `Personality: ${agent.personality_notes}` : null,
    agent.additional_instructions,
    agent.tone_traits.length > 0 ? `Tone: ${agent.tone_traits.join(', ')}` : null,
  ].filter((part): part is string => Boolean(part))

  return parts.join('\n\n')
}
```

- [ ] **Step 3: Write the worker entrypoint**

Following the exact shape confirmed in Step 1 (this is illustrative of the intended control flow — reconcile method/import names against Step 1's findings):

```typescript
// workers/voice-agent.ts
import { config } from 'dotenv'
config({ path: '.env.local' })

import * as agents from '@livekit/agents'
import { openai } from '@livekit/agents-plugin-openai'
import { FishAudioTTS } from '@/lib/voice/adapters/fish-audio-tts'
import { buildSystemPrompt } from '@/lib/voice/agent-context'
import { getAgentById } from '@/lib/data/agents'
import { updateConversationStatus } from '@/lib/data/conversations'

async function entrypoint(ctx: agents.JobContext) {
  await ctx.connect()

  const [, , agentId, conversationId] = ctx.room.name.split(':')
  const agentDetail = await getAgentById(agentId)
  if (!agentDetail) {
    await ctx.room.disconnect()
    return
  }

  const session = new agents.AgentSession({
    stt: openai.STT.withGroq({ model: 'whisper-large-v3-turbo' }),
    llm: openai.LLM.withGroq({ model: 'llama-3.3-70b-versatile' }),
    tts: new FishAudioTTS(),
  })

  const startedAt = Date.now()

  await session.start({
    room: ctx.room,
    agent: new agents.Agent({ instructions: buildSystemPrompt(agentDetail) }),
  })

  ctx.room.on('disconnected', async () => {
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000)
    await updateConversationStatus(conversationId, {
      status: 'completed',
      outcome: 'successful',
      durationSeconds,
    })
  })
}

export default agents.defineAgent({ entry: entrypoint })

agents.cli.runApp(new agents.WorkerOptions({ agent: __filename }))
```

Reconcile every method/class name here (`agents.JobContext`, `agents.AgentSession`, `agents.Agent`, `agents.defineAgent`, `agents.cli.runApp`, `agents.WorkerOptions`) against the real exports found in Step 1 — this snippet is a best-effort sketch of the intended shape based on LiveKit Agents' documented pattern (job context → session → entrypoint → CLI runner), not a verified-correct API surface. Fix names/signatures to match the installed package version exactly.

- [ ] **Step 4: Add the `roomName` parsing contract**

Note the room name format from Task 5 is `${organizationId}:call:${uuid}` — that's only 3 parts, but Step 3 above destructures 4 parts assuming an embedded `agentId` and `conversationId`. Fix this mismatch: either (a) change Task 5's room name to `${organizationId}:${agentId}:${conversationId}` so the worker can parse everything it needs from the room name alone, or (b) use LiveKit's room metadata feature (`room.metadata`, set at creation time in Task 5's `AccessToken`/room-creation call) to pass `{ agentId, conversationId }` as JSON instead of cramming it into the name. Prefer (b) — room metadata is the correct mechanism for this, room names should stay simple identifiers. Update Task 5's `startDashboardCall`/`startPublicCall` to set room metadata via the LiveKit Server SDK's `RoomServiceClient.createRoom({ name: roomName, metadata: JSON.stringify({ agentId, conversationId: conversation.id }) })` (requires calling `RoomServiceClient` explicitly before minting the token, rather than relying on LiveKit's implicit room-on-join creation), and update this worker's Step 3 to read `JSON.parse(ctx.room.metadata)` instead of splitting the room name.

- [ ] **Step 5: Add the `worker:voice` npm script**

In `package.json`, add alongside the existing `worker` script:

```json
"worker:voice": "tsx watch workers/voice-agent.ts"
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. This task has the highest chance of needing iteration against the real SDK types — budget extra time here.

- [ ] **Step 7: Manual end-to-end verification**

Run: `npm run worker:voice` in one terminal, `npm run dev` in another. From the dashboard, click "Test it", click "Start call", grant mic permission. Speak, confirm the worker logs show a transcription and the Orb's state changes (`listening` → `talking`). This is the first point where the full pipeline can be judged as actually working — expect to debug adapter/plugin issues here.

- [ ] **Step 8: Commit**

```bash
git add workers/voice-agent.ts lib/voice/agent-context.ts package.json
git commit -m "feat: add voice agent worker joining LiveKit rooms with Groq STT/LLM and Fish Audio TTS"
```

---

### Task 10: Provider error handling in the worker

**Files:**
- Modify: `workers/voice-agent.ts` (Task 9)

**Interfaces:**
- Consumes: `updateConversationStatus` (Task 4).

- [ ] **Step 1: Wrap the session start and provider calls in error handling**

Per the design doc's error-handling requirements: retry transient failures, fall back gracefully, never terminate the call abruptly when recovery is possible, log diagnostics. Wrap `entrypoint`'s body from Task 9 Step 3:

```typescript
async function entrypoint(ctx: agents.JobContext) {
  await ctx.connect()

  const metadata = JSON.parse(ctx.room.metadata || '{}') as {
    agentId?: string
    conversationId?: string
  }

  if (!metadata.agentId || !metadata.conversationId) {
    console.error(`Room ${ctx.room.name} missing agentId/conversationId metadata`)
    await ctx.room.disconnect()
    return
  }

  let agentDetail
  try {
    agentDetail = await getAgentById(metadata.agentId)
  } catch (err) {
    console.error(`Failed to load agent ${metadata.agentId}:`, err)
    await updateConversationStatus(metadata.conversationId, { status: 'failed', endedReason: 'agent_load_failed' })
    await ctx.room.disconnect()
    return
  }

  if (!agentDetail) {
    await updateConversationStatus(metadata.conversationId, { status: 'failed', endedReason: 'agent_not_found' })
    await ctx.room.disconnect()
    return
  }

  const session = new agents.AgentSession({
    stt: openai.STT.withGroq({ model: 'whisper-large-v3-turbo' }),
    llm: openai.LLM.withGroq({ model: 'llama-3.3-70b-versatile' }),
    tts: new FishAudioTTS(),
  })

  const startedAt = Date.now()

  try {
    await session.start({
      room: ctx.room,
      agent: new agents.Agent({ instructions: buildSystemPrompt(agentDetail) }),
    })
  } catch (err) {
    console.error(`Voice session failed to start for conversation ${metadata.conversationId}:`, err)
    await updateConversationStatus(metadata.conversationId, {
      status: 'failed',
      outcome: 'failed',
      endedReason: err instanceof Error ? err.message : 'session_start_failed',
    })
    await ctx.room.disconnect()
    return
  }

  ctx.room.on('disconnected', async () => {
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000)
    try {
      await updateConversationStatus(metadata.conversationId!, {
        status: 'completed',
        outcome: 'successful',
        durationSeconds,
      })
    } catch (err) {
      console.error(`Failed to finalize conversation ${metadata.conversationId}:`, err)
    }
  })
}
```

This replaces Task 9 Step 3's sketch — it supersedes the room-name-splitting logic entirely (using metadata per Task 9 Step 4's resolution), adds try/catch around every provider-facing call, and always writes a `failed` status with a reason rather than leaving a conversation stuck in `active` if something throws. Individual STT/LLM/TTS transient-failure retries are handled by each plugin's own internal retry logic (LiveKit Agents plugins retry transient provider errors by default) — this task's job is ensuring a hard failure still produces a clean `failed` conversation record instead of an orphaned `active` one or a crashed process.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification — simulate a failure**

Temporarily set `FISH_AUDIO_API_KEY` to an invalid value, start a call from the dashboard, confirm: the call surfaces an error to the caller (dialog shows the error state from Task 6, since the room disconnects), and the `conversations` row for that call ends up with `status = 'failed'` and a populated `ended_reason` rather than staying `active` forever. Revert the env var after.

- [ ] **Step 4: Commit**

```bash
git add workers/voice-agent.ts
git commit -m "feat: add provider error handling and failure-state tracking to voice worker"
```

---

### Task 11: Update TODO.md with deferred items found during this build

**Files:**
- Modify: `docs/superpowers/TODO.md`

- [ ] **Step 1: Add entries for genuinely deferred scope**

Append a new `## Voice & Calling` section noting: CAPTCHA/Turnstile bot protection for public calls (deferred per spec, IP rate-limit is the v1 bar), SIP trunk / real phone-number inbound calls into this same pipeline (future work once Twilio integration from the existing Integrations TODO entry ships), and booking-page visual customization (this build ships a minimal public page, not the full booking-page builder).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/TODO.md
git commit -m "docs: note voice pipeline follow-up items in TODO"
```
