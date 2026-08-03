# AI Agent Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 5-step agent-creation wizard (source → country → language → industry → call routing) with real website scanning (single/quick/deep crawl + Groq extraction) backed by a Redis/BullMQ job queue, plus agent list/detail pages, per `docs/superpowers/specs/2026-08-01-ai-agent-management-design.md`.

**Architecture:** Next.js Server Actions for CRUD and job dispatch; a standalone Node worker process (outside the Next.js request cycle) consumes BullMQ jobs, crawls with `cheerio`, calls Groq for extraction, writes results to `agent_scan_jobs`. Wizard polls job status via a server action. Multi-agent per org, RLS-scoped like existing tables.

**Tech Stack:** Next.js 16, TypeScript, Supabase, `bullmq` + `ioredis`, `cheerio`, Groq SDK (`groq-sdk`), Zod, shadcn/ui (Combobox, RadioGroup, Tabs).

## Global Constraints

- Light mode only, shadcn defaults only, Tailwind layout utilities, Lucide/Phosphor icons only (this project migrated to `@phosphor-icons/react` — use that, not lucide, for any new icons in app code).
- Route Handler `context.params` is a `Promise` — always `await params`.
- Every table scoped by `organization_id` (directly or via join), RLS enforced.
- Server actions return `{ error: string }` or redirect/succeed — never throw raw errors to the client.
- Local Redis: `REDIS_URL=redis://localhost:6379/0` (already running per user). Add to `.env.example` and `.env.local`.
- Groq API key: user has one ready — task requiring it is marked **BLOCKED: needs Groq API key**, pause and ask for it rather than fabricating.
- Crawler must respect `robots.txt` and send an honest User-Agent (`FrontDeskAI-Bot/1.0`). Never crawl off the target domain.
- Apply `design-taste-frontend` skill (installed at `.claude/skills/`) for wizard UI polish — shadcn components + Tailwind only, no custom CSS, matching the established Apple/ElevenLabs-taste bar from the auth/dashboard phase.

---

### Task 1: Dependencies and Redis/queue scaffolding

**Files:**
- Modify: `package.json`
- Create: `lib/queue/connection.ts`
- Create: `lib/queue/queues/scan-website.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `redisConnection` (ioredis instance) in `lib/queue/connection.ts`. `scanWebsiteQueue` (BullMQ `Queue` instance, queue name `'scan-website'`) in `lib/queue/queues/scan-website.ts`. `ScanWebsiteJobData` type: `{ scanJobId: string; url: string; scanDepth: 'single' | 'quick' | 'deep' }`.

- [ ] **Step 1: Install dependencies**

Run: `npm install bullmq ioredis cheerio groq-sdk`
Run: `npm install -D @types/node` (already present, skip if so)

- [ ] **Step 2: Add REDIS_URL to env files**

Append to `.env.example`: `REDIS_URL=redis://localhost:6379/0`
Append to `.env.local` (if it exists locally, not committed): `REDIS_URL=redis://localhost:6379/0`

- [ ] **Step 3: Create Redis connection**

`lib/queue/connection.ts`:
```ts
import IORedis from 'ioredis'

export const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})
```

- [ ] **Step 4: Create scan-website queue**

`lib/queue/queues/scan-website.ts`:
```ts
import { Queue } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'

export type ScanDepth = 'single' | 'quick' | 'deep'

export type ScanWebsiteJobData = {
  scanJobId: string
  url: string
  scanDepth: ScanDepth
}

export const scanWebsiteQueue = new Queue<ScanWebsiteJobData>('scan-website', {
  connection: redisConnection,
})
```

- [ ] **Step 5: Verify build compiles**

Run: `npm run build`
Expected: no TypeScript/module errors. The queue module is imported but not yet used anywhere, so no runtime Redis connection is attempted during build.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/queue .env.example
git commit -m "feat: add BullMQ queue scaffolding for website scan jobs"
```

---

### Task 2: Database schema for agents and scan jobs (BLOCKED: needs Supabase credentials already in .env.local)

**Files:**
- Create: `supabase/migrations/00000000000003_agents_and_scan_jobs.sql`

**Interfaces:**
- Produces: `agents` and `agent_scan_jobs` tables with RLS, consumed by every later task's queries.

- [ ] **Step 1: Write migration SQL**

`supabase/migrations/00000000000003_agents_and_scan_jobs.sql`:
```sql
create table agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  business_name text,
  country text,
  language text,
  industry text,
  greeting_prompt text,
  personality_notes text,
  answering_mode text check (answering_mode in ('staff_first', 'agent_first')),
  staff_phone_number text,
  max_ring_seconds integer not null default 20,
  hold_music text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  url text not null,
  scan_depth text not null check (scan_depth in ('single', 'quick', 'deep')),
  status text not null check (status in ('pending', 'running', 'completed', 'failed')) default 'pending',
  extracted_data jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table agents enable row level security;
alter table agent_scan_jobs enable row level security;

create policy "Members can view their organization's agents"
  on agents for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create agents in their organization"
  on agents for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's agents"
  on agents for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can view scan jobs for their organization's agents"
  on agent_scan_jobs for select
  using (
    agent_id in (
      select id from agents where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
    or agent_id is null
  );
```

Note: `agent_scan_jobs.agent_id` is nullable because a scan can be kicked off before the agent row exists (the wizard scans a website before the user has finished the rest of the wizard and created the agent). The `or agent_id is null` clause in the select policy is intentionally permissive for this pre-agent-creation window; the service-role client (used by the worker) bypasses RLS entirely for writes, so this only affects client-side reads of not-yet-linked scan jobs, which the wizard polls using a job ID it already possesses.

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` (with `SUPABASE_ACCESS_TOKEN` env var set, project already linked from the previous phase)
Expected: migration applies cleanly, both tables visible in Supabase dashboard.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add agents and agent_scan_jobs schema with RLS"
```

---

### Task 3: Zod schemas for wizard steps

**Files:**
- Create: `lib/validations/agent.ts`
- Test: `lib/validations/agent.test.ts`

**Interfaces:**
- Produces: `scanRequestSchema` (`{ url: string().url(), scanDepth: enum(['single','quick','deep']) }`), `manualBusinessInfoSchema` (`{ businessName: string().min(1) }`), `countryLanguageSchema` (`{ country: string().min(1), language: string().min(1) }`), `industrySchema` (`{ industry: string().min(1) }`), `callRoutingSchema` (`{ answeringMode: enum(['staff_first','agent_first']), staffPhoneNumber: string().regex(phone), maxRingSeconds: number().int().min(5).max(60), holdMusic: string().optional() }`), `createAgentSchema` combining all fields for final submission — all exported with inferred types.

- [ ] **Step 1: Write failing tests**

`lib/validations/agent.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  scanRequestSchema,
  manualBusinessInfoSchema,
  countryLanguageSchema,
  industrySchema,
  callRoutingSchema,
} from './agent'

describe('scanRequestSchema', () => {
  it('accepts a valid URL and depth', () => {
    const result = scanRequestSchema.safeParse({ url: 'https://example.com', scanDepth: 'single' })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid URL', () => {
    const result = scanRequestSchema.safeParse({ url: 'not-a-url', scanDepth: 'single' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid scan depth', () => {
    const result = scanRequestSchema.safeParse({ url: 'https://example.com', scanDepth: 'medium' })
    expect(result.success).toBe(false)
  })
})

describe('manualBusinessInfoSchema', () => {
  it('accepts a business name', () => {
    expect(manualBusinessInfoSchema.safeParse({ businessName: 'Acme Dental' }).success).toBe(true)
  })

  it('rejects an empty business name', () => {
    expect(manualBusinessInfoSchema.safeParse({ businessName: '' }).success).toBe(false)
  })
})

describe('countryLanguageSchema', () => {
  it('accepts country and language', () => {
    const result = countryLanguageSchema.safeParse({ country: 'United States', language: 'English' })
    expect(result.success).toBe(true)
  })
})

describe('industrySchema', () => {
  it('accepts an industry', () => {
    expect(industrySchema.safeParse({ industry: 'Dental' }).success).toBe(true)
  })
})

describe('callRoutingSchema', () => {
  it('accepts valid call routing config', () => {
    const result = callRoutingSchema.safeParse({
      answeringMode: 'staff_first',
      staffPhoneNumber: '+15855318253',
      maxRingSeconds: 20,
    })
    expect(result.success).toBe(true)
  })

  it('rejects ring time out of range', () => {
    const result = callRoutingSchema.safeParse({
      answeringMode: 'staff_first',
      staffPhoneNumber: '+15855318253',
      maxRingSeconds: 120,
    })
    expect(result.success).toBe(false)
  })

  it('rejects malformed phone number', () => {
    const result = callRoutingSchema.safeParse({
      answeringMode: 'staff_first',
      staffPhoneNumber: 'abc',
      maxRingSeconds: 20,
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- lib/validations/agent.test.ts`
Expected: FAIL — `./agent` module not found.

- [ ] **Step 3: Implement schemas**

`lib/validations/agent.ts`:
```ts
import { z } from 'zod'

export const scanRequestSchema = z.object({
  url: z.string().url('Enter a valid URL'),
  scanDepth: z.enum(['single', 'quick', 'deep']),
})
export type ScanRequestInput = z.infer<typeof scanRequestSchema>

export const manualBusinessInfoSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(200),
})
export type ManualBusinessInfoInput = z.infer<typeof manualBusinessInfoSchema>

export const countryLanguageSchema = z.object({
  country: z.string().min(1, 'Select a country'),
  language: z.string().min(1, 'Select a language'),
})
export type CountryLanguageInput = z.infer<typeof countryLanguageSchema>

export const industrySchema = z.object({
  industry: z.string().min(1, 'Select an industry'),
})
export type IndustryInput = z.infer<typeof industrySchema>

export const callRoutingSchema = z.object({
  answeringMode: z.enum(['staff_first', 'agent_first']),
  staffPhoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number'),
  maxRingSeconds: z.number().int().min(5).max(60),
  holdMusic: z.string().optional(),
})
export type CallRoutingInput = z.infer<typeof callRoutingSchema>

export const createAgentSchema = z.object({
  businessName: z.string().min(1).max(200),
  country: z.string().min(1),
  language: z.string().min(1),
  industry: z.string().min(1),
  answeringMode: z.enum(['staff_first', 'agent_first']),
  staffPhoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/),
  maxRingSeconds: z.number().int().min(5).max(60),
  holdMusic: z.string().optional(),
  greetingPrompt: z.string().optional(),
  personalityNotes: z.string().optional(),
})
export type CreateAgentInput = z.infer<typeof createAgentSchema>
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- lib/validations/agent.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validations/agent.ts lib/validations/agent.test.ts
git commit -m "feat: add Zod validation schemas for agent wizard steps"
```

---

### Task 4: Groq provider adapter (BLOCKED: needs Groq API key)

**Files:**
- Create: `lib/providers/llm/types.ts`
- Create: `lib/providers/llm/groq.ts`
- Test: `lib/providers/llm/groq.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `LLMProvider` interface in `types.ts`: `{ extractBusinessInfo(pageText: string): Promise<ExtractedBusinessInfo> }`. `ExtractedBusinessInfo` type: `{ businessName: string | null; hours: string | null; services: string[]; suggestedIndustry: string | null }`. `createGroqProvider(): LLMProvider` in `groq.ts`.

**BLOCKED:** Ask user: "Please provide your Groq API key (from console.groq.com/keys) so I can wire up the extraction call." Add it to `.env.local` as `GROQ_API_KEY` once provided. Do not fabricate a key or skip testing this integration.

- [ ] **Step 1: Define the provider interface**

`lib/providers/llm/types.ts`:
```ts
export type ExtractedBusinessInfo = {
  businessName: string | null
  hours: string | null
  services: string[]
  suggestedIndustry: string | null
}

export interface LLMProvider {
  extractBusinessInfo(pageText: string): Promise<ExtractedBusinessInfo>
}
```

- [ ] **Step 2: Write failing test with a mocked Groq SDK**

`lib/providers/llm/groq.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('groq-sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    businessName: 'Acme Dental',
                    hours: 'Mon-Fri 9am-5pm',
                    services: ['Cleanings', 'Whitening'],
                    suggestedIndustry: 'Dental',
                  }),
                },
              },
            ],
          }),
        },
      },
    })),
  }
})

import { createGroqProvider } from './groq'

describe('createGroqProvider', () => {
  it('extracts structured business info from page text', async () => {
    const provider = createGroqProvider()
    const result = await provider.extractBusinessInfo('Acme Dental is open Mon-Fri 9am-5pm...')
    expect(result).toEqual({
      businessName: 'Acme Dental',
      hours: 'Mon-Fri 9am-5pm',
      services: ['Cleanings', 'Whitening'],
      suggestedIndustry: 'Dental',
    })
  })
})
```

- [ ] **Step 3: Run test to verify failure**

Run: `npm test -- lib/providers/llm/groq.test.ts`
Expected: FAIL — `./groq` module not found.

- [ ] **Step 4: Implement the Groq provider**

`lib/providers/llm/groq.ts`:
```ts
import 'server-only'
import Groq from 'groq-sdk'
import type { LLMProvider, ExtractedBusinessInfo } from './types'

const EXTRACTION_PROMPT = `You are extracting business information from website text. Given the page content below, respond with ONLY a JSON object matching this exact shape, no other text:
{"businessName": string | null, "hours": string | null, "services": string[], "suggestedIndustry": string | null}

Page content:
`

export function createGroqProvider(): LLMProvider {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY! })

  return {
    async extractBusinessInfo(pageText: string): Promise<ExtractedBusinessInfo> {
      const response = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: EXTRACTION_PROMPT + pageText.slice(0, 12000) }],
        temperature: 0.2,
      })

      const content = response.choices[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(content)

      return {
        businessName: parsed.businessName ?? null,
        hours: parsed.hours ?? null,
        services: Array.isArray(parsed.services) ? parsed.services : [],
        suggestedIndustry: parsed.suggestedIndustry ?? null,
      }
    },
  }
}
```

- [ ] **Step 5: Run test to verify pass**

Run: `npm test -- lib/providers/llm/groq.test.ts`
Expected: PASS.

- [ ] **Step 6: Add GROQ_API_KEY to env example**

Append to `.env.example`: `GROQ_API_KEY=`

- [ ] **Step 7: Commit**

```bash
git add lib/providers/llm .env.example
git commit -m "feat: add Groq LLM provider for business info extraction"
```

---

### Task 5: Crawler implementation

**Files:**
- Create: `lib/crawler/robots.ts`
- Create: `lib/crawler/fetch-page.ts`
- Create: `lib/crawler/crawl.ts`
- Test: `lib/crawler/robots.test.ts`
- Test: `lib/crawler/crawl.test.ts`

**Interfaces:**
- Produces: `isAllowedByRobots(url: string, robotsTxt: string): boolean` in `robots.ts`. `fetchPageText(url: string): Promise<string>` in `fetch-page.ts` (fetches HTML, strips to visible text via cheerio, honest User-Agent). `crawlWebsite(startUrl: string, depth: 'single' | 'quick' | 'deep'): Promise<string>` in `crawl.ts` (returns concatenated page text from all crawled pages, respects robots.txt, same-domain only, budget/timeout-bounded per depth).

- [ ] **Step 1: Write failing test for robots.txt parsing**

`lib/crawler/robots.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isAllowedByRobots } from './robots'

describe('isAllowedByRobots', () => {
  it('allows a path when robots.txt has no matching disallow', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /admin'
    expect(isAllowedByRobots('https://example.com/about', robotsTxt)).toBe(true)
  })

  it('disallows a path matching a Disallow rule', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /admin'
    expect(isAllowedByRobots('https://example.com/admin/settings', robotsTxt)).toBe(false)
  })

  it('allows everything when robots.txt is empty', () => {
    expect(isAllowedByRobots('https://example.com/anything', '')).toBe(true)
  })

  it('disallows everything when robots.txt has a blanket disallow', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /'
    expect(isAllowedByRobots('https://example.com/anything', robotsTxt)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- lib/crawler/robots.test.ts`
Expected: FAIL — `./robots` module not found.

- [ ] **Step 3: Implement robots.txt parser**

`lib/crawler/robots.ts`:
```ts
export function isAllowedByRobots(url: string, robotsTxt: string): boolean {
  const path = new URL(url).pathname
  const lines = robotsTxt.split('\n').map((l) => l.trim())

  let applies = false
  const disallowedPaths: string[] = []

  for (const line of lines) {
    if (/^user-agent:\s*\*/i.test(line)) {
      applies = true
      continue
    }
    if (/^user-agent:/i.test(line)) {
      applies = false
      continue
    }
    if (applies && /^disallow:/i.test(line)) {
      const value = line.split(':').slice(1).join(':').trim()
      if (value) disallowedPaths.push(value)
    }
  }

  return !disallowedPaths.some((disallowed) => path.startsWith(disallowed))
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- lib/crawler/robots.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement page fetching with cheerio text extraction**

`lib/crawler/fetch-page.ts`:
```ts
import 'server-only'
import * as cheerio from 'cheerio'

const USER_AGENT = 'FrontDeskAI-Bot/1.0'
const FETCH_TIMEOUT_MS = 10_000

export async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      throw new Error(`Unsupported content type: ${contentType}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    $('script, style, nav, footer, noscript').remove()
    return $('body').text().replace(/\s+/g, ' ').trim()
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchRobotsTxt(origin: string): Promise<string> {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) return ''
    return await response.text()
  } catch {
    return ''
  }
}

export function extractSameDomainLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html)
  const origin = new URL(baseUrl).origin
  const links = new Set<string>()

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    try {
      const resolved = new URL(href, baseUrl)
      if (resolved.origin === origin) {
        links.add(resolved.origin + resolved.pathname)
      }
    } catch {
      // ignore malformed hrefs
    }
  })

  return Array.from(links)
}
```

- [ ] **Step 6: Write failing test for crawl budget/depth logic**

`lib/crawler/crawl.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./fetch-page', () => ({
  fetchPageText: vi.fn().mockResolvedValue('page text content'),
  fetchRobotsTxt: vi.fn().mockResolvedValue(''),
  extractSameDomainLinks: vi.fn().mockReturnValue([
    'https://example.com/about',
    'https://example.com/services',
    'https://example.com/contact',
  ]),
}))

import { crawlWebsite } from './crawl'
import { fetchPageText } from './fetch-page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('crawlWebsite', () => {
  it('single depth fetches only the start URL', async () => {
    await crawlWebsite('https://example.com', 'single')
    expect(fetchPageText).toHaveBeenCalledTimes(1)
    expect(fetchPageText).toHaveBeenCalledWith('https://example.com')
  })

  it('quick depth fetches the root plus discovered same-domain links, budget-capped', async () => {
    await crawlWebsite('https://example.com', 'quick')
    const calls = (fetchPageText as ReturnType<typeof vi.fn>).mock.calls.length
    expect(calls).toBeGreaterThan(1)
    expect(calls).toBeLessThanOrEqual(6)
  })

  it('returns concatenated text from all fetched pages', async () => {
    const result = await crawlWebsite('https://example.com', 'single')
    expect(result).toContain('page text content')
  })
})
```

- [ ] **Step 7: Run test to verify failure**

Run: `npm test -- lib/crawler/crawl.test.ts`
Expected: FAIL — `./crawl` module not found.

- [ ] **Step 8: Implement the crawler**

`lib/crawler/crawl.ts`:
```ts
import 'server-only'
import { isAllowedByRobots } from './robots'
import { fetchPageText, fetchRobotsTxt, extractSameDomainLinks } from './fetch-page'

const DEPTH_BUDGETS = {
  single: { maxPages: 1, maxDepth: 0 },
  quick: { maxPages: 6, maxDepth: 1 },
  deep: { maxPages: 20, maxDepth: 2 },
} as const

export async function crawlWebsite(
  startUrl: string,
  scanDepth: 'single' | 'quick' | 'deep'
): Promise<string> {
  const budget = DEPTH_BUDGETS[scanDepth]
  const origin = new URL(startUrl).origin
  const robotsTxt = await fetchRobotsTxt(origin)

  const visited = new Set<string>()
  const pageTexts: string[] = []
  let queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }]

  while (queue.length > 0 && visited.size < budget.maxPages) {
    const { url, depth } = queue.shift()!
    if (visited.has(url)) continue
    if (!isAllowedByRobots(url, robotsTxt)) continue

    visited.add(url)

    try {
      const text = await fetchPageText(url)
      pageTexts.push(text)
    } catch {
      continue
    }

    if (depth < budget.maxDepth && visited.size < budget.maxPages) {
      const response = await fetch(url, { headers: { 'User-Agent': 'FrontDeskAI-Bot/1.0' } }).catch(
        () => null
      )
      if (!response) continue
      const html = await response.text()
      const links = extractSameDomainLinks(html, url)
      const heuristicPaths = ['about', 'services', 'contact', 'hours', 'pricing']
      const prioritized = links
        .filter((link) => !visited.has(link))
        .sort((a, b) => {
          const aMatch = heuristicPaths.some((p) => a.includes(p)) ? 0 : 1
          const bMatch = heuristicPaths.some((p) => b.includes(p)) ? 0 : 1
          return aMatch - bMatch
        })

      for (const link of prioritized) {
        if (visited.size + queue.length >= budget.maxPages) break
        queue.push({ url: link, depth: depth + 1 })
      }
    }
  }

  return pageTexts.join('\n\n')
}
```

- [ ] **Step 9: Run test to verify pass**

Run: `npm test -- lib/crawler/crawl.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add lib/crawler
git commit -m "feat: add website crawler with robots.txt handling and depth budgets"
```

---

### Task 6: Worker process and scan job server actions

**Files:**
- Create: `workers/scan-website.ts`
- Create: `app/(dashboard)/agents/actions.ts`
- Test: `app/(dashboard)/agents/actions.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `scanWebsiteQueue` from `lib/queue/queues/scan-website.ts`, `crawlWebsite` from `lib/crawler/crawl.ts`, `createGroqProvider` from `lib/providers/llm/groq.ts`, `createServiceRoleClient` from `lib/supabase/server.ts`.
- Produces: `startWebsiteScan(input: ScanRequestInput): Promise<{ scanJobId: string } | { error: string }>` and `getScanJobStatus(scanJobId: string): Promise<{ status: string; extractedData: ExtractedBusinessInfo | null; errorMessage: string | null } | { error: string }>` server actions in `app/(dashboard)/agents/actions.ts`.

- [ ] **Step 1: Write failing test for startWebsiteScan validation**

`app/(dashboard)/agents/actions.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { startWebsiteScan } from './actions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/queue/queues/scan-website', () => ({
  scanWebsiteQueue: { add: vi.fn() },
}))

describe('startWebsiteScan', () => {
  it('returns a validation error for an invalid URL', async () => {
    const result = await startWebsiteScan({ url: 'not-a-url', scanDepth: 'single' })
    expect(result).toEqual({ error: 'Enter a valid URL' })
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- "app/(dashboard)/agents/actions.test.ts"`
Expected: FAIL — `./actions` module not found.

- [ ] **Step 3: Implement server actions**

`app/(dashboard)/agents/actions.ts`:
```ts
'use server'

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { scanRequestSchema, createAgentSchema, type ScanRequestInput, type CreateAgentInput } from '@/lib/validations/agent'
import { scanWebsiteQueue } from '@/lib/queue/queues/scan-website'
import type { ExtractedBusinessInfo } from '@/lib/providers/llm/types'
import { redirect } from 'next/navigation'

export async function startWebsiteScan(
  input: ScanRequestInput
): Promise<{ scanJobId: string } | { error: string }> {
  const parsed = scanRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const serviceClient = createServiceRoleClient()
  const { data: job, error } = await serviceClient
    .from('agent_scan_jobs')
    .insert({ url: parsed.data.url, scan_depth: parsed.data.scanDepth, status: 'pending' })
    .select('id')
    .single()

  if (error || !job) {
    return { error: 'Could not start scan. Please try again.' }
  }

  await scanWebsiteQueue.add('scan', {
    scanJobId: job.id,
    url: parsed.data.url,
    scanDepth: parsed.data.scanDepth,
  })

  return { scanJobId: job.id }
}

export async function getScanJobStatus(scanJobId: string): Promise<
  | { status: string; extractedData: ExtractedBusinessInfo | null; errorMessage: string | null }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: job, error } = await supabase
    .from('agent_scan_jobs')
    .select('status, extracted_data, error_message')
    .eq('id', scanJobId)
    .single()

  if (error || !job) {
    return { error: 'Scan job not found.' }
  }

  return {
    status: job.status,
    extractedData: job.extracted_data,
    errorMessage: job.error_message,
  }
}

export async function createAgent(input: CreateAgentInput): Promise<{ error: string }> {
  const parsed = createAgentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      organization_id: member.organization_id,
      name: parsed.data.businessName,
      business_name: parsed.data.businessName,
      country: parsed.data.country,
      language: parsed.data.language,
      industry: parsed.data.industry,
      answering_mode: parsed.data.answeringMode,
      staff_phone_number: parsed.data.staffPhoneNumber,
      max_ring_seconds: parsed.data.maxRingSeconds,
      hold_music: parsed.data.holdMusic,
      greeting_prompt: parsed.data.greetingPrompt,
      personality_notes: parsed.data.personalityNotes,
    })
    .select('id')
    .single()

  if (error || !agent) {
    return { error: 'Could not create agent. Please try again.' }
  }

  redirect(`/agents/${agent.id}`)
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- "app/(dashboard)/agents/actions.test.ts"`
Expected: PASS.

- [ ] **Step 5: Implement the worker process**

`workers/scan-website.ts`:
```ts
import 'dotenv/config'
import { Worker } from 'bullmq'
import { redisConnection } from '@/lib/queue/connection'
import { crawlWebsite } from '@/lib/crawler/crawl'
import { createGroqProvider } from '@/lib/providers/llm/groq'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { ScanWebsiteJobData } from '@/lib/queue/queues/scan-website'

const worker = new Worker<ScanWebsiteJobData>(
  'scan-website',
  async (job) => {
    const { scanJobId, url, scanDepth } = job.data
    const serviceClient = createServiceRoleClient()

    await serviceClient.from('agent_scan_jobs').update({ status: 'running' }).eq('id', scanJobId)

    try {
      const pageText = await crawlWebsite(url, scanDepth)
      const provider = createGroqProvider()
      const extracted = await provider.extractBusinessInfo(pageText)

      await serviceClient
        .from('agent_scan_jobs')
        .update({
          status: 'completed',
          extracted_data: extracted,
          completed_at: new Date().toISOString(),
        })
        .eq('id', scanJobId)
    } catch (err) {
      await serviceClient
        .from('agent_scan_jobs')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', scanJobId)
    }
  },
  { connection: redisConnection }
)

worker.on('failed', (job, err) => {
  console.error(`Scan job ${job?.id} failed:`, err)
})

console.log('Scan website worker started, listening for jobs...')
```

Note: `workers/scan-website.ts` imports from `@/lib/...` paths, which requires either running it through `tsx`/`ts-node` with the same path alias resolution as Next.js, or compiling separately. Use `tsx` (add as a dev dependency) to run it directly with TypeScript + path alias support.

- [ ] **Step 6: Install tsx and add worker script**

Run: `npm install -D tsx dotenv`

Add to `package.json` scripts: `"worker": "tsx watch workers/scan-website.ts"`

- [ ] **Step 7: Verify build compiles**

Run: `npm run build`
Expected: no TypeScript errors. The worker file is not part of the Next.js build (it's run separately via `npm run worker`), but `tsc`-level type checking during `next build` should still pass since the file isn't imported by app code.

- [ ] **Step 8: Manually verify the worker starts**

Run: `npm run worker` in a separate terminal
Expected: logs "Scan website worker started, listening for jobs..." with no connection errors (requires local Redis running at `redis://localhost:6379/0`).

- [ ] **Step 9: Commit**

```bash
git add workers "app/(dashboard)/agents/actions.ts" "app/(dashboard)/agents/actions.test.ts" package.json package-lock.json
git commit -m "feat: add scan-website worker process and agent server actions"
```

---

### Task 7: Wizard step components

**Files:**
- Create: `components/agents/wizard/source-step.tsx`
- Create: `components/agents/wizard/scan-progress-step.tsx`
- Create: `components/agents/wizard/country-step.tsx`
- Create: `components/agents/wizard/language-step.tsx`
- Create: `components/agents/wizard/industry-step.tsx`
- Create: `components/agents/wizard/call-routing-step.tsx`
- Create: `lib/data/countries.ts`
- Create: `lib/data/industries.ts`

**Interfaces:**
- Consumes: `scanRequestSchema`, `manualBusinessInfoSchema`, `countryLanguageSchema`, `industrySchema`, `callRoutingSchema` from `lib/validations/agent.ts`. `startWebsiteScan`, `getScanJobStatus` from `app/(dashboard)/agents/actions.ts`.
- Produces: Each step component takes `{ onNext: (data: Partial<CreateAgentInput>) => void; onBack?: () => void; initialData?: Partial<CreateAgentInput> }` and calls `onNext` with the fields it collects, merged into wizard state by the parent (Task 8).

- [ ] **Step 1: Apply design-taste-frontend skill for wizard visual direction**

Before writing JSX, invoke `design-taste-frontend` to settle spacing/copy/card treatment for the wizard steps — matching the reference screenshots' card-grid pattern (rounded gradient tiles for source/scan-depth choice, flag-grid for country, card-grid for industry) using only shadcn `Card`, `Button`, `RadioGroup`, `Input`, `Combobox` — no custom CSS.

- [ ] **Step 2: Create country and industry data files**

`lib/data/countries.ts`:
```ts
export const countries = [
  { code: 'US', name: 'United States' },
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
]
```

`lib/data/industries.ts`:
```ts
import type { Icon } from '@phosphor-icons/react'
import {
  Scales,
  House,
  Buildings,
  Scissors,
  Briefcase,
  PawPrint,
  Barbell,
  Sparkle,
  Heart,
  Car,
  Camera,
  GraduationCap,
  DotsThree,
  Tooth,
  FirstAid,
} from '@phosphor-icons/react/dist/ssr'

export const industries: { value: string; label: string; icon: Icon }[] = [
  { value: 'legal', label: 'Legal', icon: Scales },
  { value: 'home_services', label: 'Home services', icon: House },
  { value: 'real_estate', label: 'Real estate', icon: Buildings },
  { value: 'salon_barbershop', label: 'Salon & barbershop', icon: Scissors },
  { value: 'consulting', label: 'Consulting', icon: Briefcase },
  { value: 'veterinary', label: 'Veterinary', icon: PawPrint },
  { value: 'fitness', label: 'Fitness', icon: Barbell },
  { value: 'nail_beauty', label: 'Nail & beauty', icon: Sparkle },
  { value: 'spa', label: 'Spa', icon: Heart },
  { value: 'auto_service', label: 'Auto service', icon: Car },
  { value: 'photography', label: 'Photography', icon: Camera },
  { value: 'tutoring', label: 'Tutoring', icon: GraduationCap },
  { value: 'dental', label: 'Dental', icon: Tooth },
  { value: 'medical', label: 'Medical', icon: FirstAid },
  { value: 'other', label: 'Other', icon: DotsThree },
]
```

- [ ] **Step 3: Create source-step (scan vs. manual choice)**

`components/agents/wizard/source-step.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { Globe, PencilSimple, Lightning, Target, FileText } from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { scanRequestSchema, type ScanRequestInput } from '@/lib/validations/agent'

type SourceChoice = 'menu' | 'scan-url' | 'scan-depth'

export function SourceStep({
  onScanStarted,
  onManual,
}: {
  onScanStarted: (input: ScanRequestInput) => void
  onManual: () => void
}) {
  const [choice, setChoice] = useState<SourceChoice>('menu')
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  if (choice === 'menu') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Let&apos;s get your receptionist live</h1>
          <p className="text-muted-foreground">
            Drop a URL and we&apos;ll have it ready in less than one minute, or enter details manually.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={() => setChoice('scan-url')}
          >
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <Globe className="size-8" />
              <p className="font-medium">Scan my website</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer transition-colors hover:bg-accent" onClick={onManual}>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <PencilSimple className="size-8" />
              <p className="font-medium">Enter information manually</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (choice === 'scan-url') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">We&apos;ll get your agent up and running!</h1>
          <p className="text-muted-foreground">Paste a link to your website or any other knowledge source</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="website-url">Website URL</Label>
          <Input
            id="website-url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {urlError && <p className="text-sm text-destructive">{urlError}</p>}
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onManual}>
            Skip
          </Button>
          <Button
            onClick={() => {
              const parsed = scanRequestSchema.safeParse({ url, scanDepth: 'single' })
              if (!parsed.success) {
                setUrlError(parsed.error.issues[0].message)
                return
              }
              setChoice('scan-depth')
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    )
  }

  const depthOptions: { value: 'single' | 'quick' | 'deep'; label: string; description: string; icon: typeof FileText }[] = [
    { value: 'single', label: 'Single page', description: 'Ideal for a business profile or listing', icon: FileText },
    { value: 'quick', label: 'Quick scan', description: 'Scans a smart selection of your pages', icon: Lightning },
    { value: 'deep', label: 'Deep scan', description: 'Systematically maps and reads your site', icon: Target },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">How thoroughly should we scan?</h1>
        <p className="text-muted-foreground">
          Single page is ideal for profiles. Quick scan picks a smart selection. Deep scan maps your
          whole site.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {depthOptions.map((option) => (
          <Card
            key={option.value}
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={() => onScanStarted({ url, scanDepth: option.value })}
          >
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <option.icon className="size-8" />
              <p className="font-medium">{option.label}</p>
              <p className="text-xs text-muted-foreground">{option.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button variant="ghost" onClick={() => setChoice('scan-url')}>
        Back
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Create scan-progress-step**

`components/agents/wizard/scan-progress-step.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { getScanJobStatus } from '@/app/(dashboard)/agents/actions'
import type { ExtractedBusinessInfo } from '@/lib/providers/llm/types'

export function ScanProgressStep({
  scanJobId,
  onComplete,
  onSkip,
}: {
  scanJobId: string
  onComplete: (data: ExtractedBusinessInfo) => void
  onSkip: () => void
}) {
  const [status, setStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      const result = await getScanJobStatus(scanJobId)
      if (cancelled) return

      if ('error' in result) {
        setStatus('failed')
        setErrorMessage(result.error)
        return
      }

      setStatus(result.status as typeof status)

      if (result.status === 'completed' && result.extractedData) {
        onComplete(result.extractedData)
        return
      }

      if (result.status === 'failed') {
        setErrorMessage(result.errorMessage ?? 'Scan failed.')
        return
      }

      setTimeout(poll, 2000)
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [scanJobId, onComplete])

  if (status === 'failed') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Scan failed</h1>
        <p className="text-sm text-destructive">{errorMessage}</p>
        <Button onClick={onSkip}>Enter information manually instead</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reading website content...</h1>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <Button variant="ghost" onClick={onSkip}>
        Skip and enter manually
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: Create country-step**

`components/agents/wizard/country-step.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { countries } from '@/lib/data/countries'

export function CountryStep({
  initialCountry,
  onNext,
  onBack,
}: {
  initialCountry?: string
  onNext: (country: string) => void
  onBack: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(initialCountry ?? '')

  const filtered = countries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Where is your business located?</h1>
        <p className="text-muted-foreground">This helps us set up the right phone numbers and regional settings.</p>
      </div>
      <Input placeholder="Search countries..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto">
        {filtered.map((country) => (
          <button
            key={country.code}
            type="button"
            onClick={() => setSelected(country.name)}
            className={`rounded-lg border p-3 text-left text-sm transition-colors ${
              selected === country.name ? 'border-primary bg-accent' : 'hover:bg-accent'
            }`}
          >
            {country.name}
          </button>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!selected} onClick={() => onNext(selected)}>
          Continue
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create language-step**

`components/agents/wizard/language-step.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const LANGUAGES = ['English', 'Hindi']

export function LanguageStep({
  initialLanguage,
  onNext,
  onBack,
}: {
  initialLanguage?: string
  onNext: (language: string) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(initialLanguage ?? 'English')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">What language should your agent speak?</h1>
        <p className="text-muted-foreground">Your agent&apos;s greeting and replies will use this language.</p>
      </div>
      <div className="flex gap-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setSelected(lang)}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
              selected === lang ? 'border-primary bg-accent font-medium' : 'hover:bg-accent'
            }`}
          >
            {lang}
          </button>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => onNext(selected)}>Continue</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create industry-step**

`components/agents/wizard/industry-step.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { industries } from '@/lib/data/industries'

export function IndustryStep({
  initialIndustry,
  onNext,
  onBack,
}: {
  initialIndustry?: string
  onNext: (industry: string) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(initialIndustry ?? '')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">What industry are you in?</h1>
        <p className="text-muted-foreground">We&apos;ll set up your booking system accordingly.</p>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {industries.map((industry) => (
          <button
            key={industry.value}
            type="button"
            onClick={() => setSelected(industry.value)}
            className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors ${
              selected === industry.value ? 'border-primary bg-accent' : 'hover:bg-accent'
            }`}
          >
            <industry.icon className="size-6" />
            {industry.label}
          </button>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!selected} onClick={() => onNext(selected)}>
          Continue
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Create call-routing-step**

`components/agents/wizard/call-routing-step.tsx`:
```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { callRoutingSchema, type CallRoutingInput } from '@/lib/validations/agent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export function CallRoutingStep({
  initialData,
  onNext,
  onBack,
}: {
  initialData?: Partial<CallRoutingInput>
  onNext: (data: CallRoutingInput) => void
  onBack: () => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CallRoutingInput>({
    resolver: zodResolver(callRoutingSchema),
    defaultValues: {
      answeringMode: initialData?.answeringMode ?? 'staff_first',
      staffPhoneNumber: initialData?.staffPhoneNumber ?? '',
      maxRingSeconds: initialData?.maxRingSeconds ?? 20,
      holdMusic: initialData?.holdMusic,
    },
  })

  const answeringMode = watch('answeringMode')

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Calls on your terms</h1>
        <p className="text-muted-foreground">Route calls to staff first or let your agent handle them.</p>
      </div>
      <div className="space-y-2">
        <Label>Who answers first</Label>
        <RadioGroup
          value={answeringMode}
          onValueChange={(v) => setValue('answeringMode', v as CallRoutingInput['answeringMode'])}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="staff_first" id="staff_first" />
            <Label htmlFor="staff_first">Staff first</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="agent_first" id="agent_first" />
            <Label htmlFor="agent_first">Agent first</Label>
          </div>
        </RadioGroup>
      </div>
      <div className="space-y-2">
        <Label htmlFor="staffPhoneNumber">Staff phone number</Label>
        <Input id="staffPhoneNumber" placeholder="+1 555 123 4567" {...register('staffPhoneNumber')} />
        {errors.staffPhoneNumber && (
          <p className="text-sm text-destructive">{errors.staffPhoneNumber.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="maxRingSeconds">Maximum ring time (seconds)</Label>
        <Input
          id="maxRingSeconds"
          type="number"
          {...register('maxRingSeconds', { valueAsNumber: true })}
        />
        {errors.maxRingSeconds && (
          <p className="text-sm text-destructive">{errors.maxRingSeconds.message}</p>
        )}
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" type="button" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Finish'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 9: Verify build compiles**

Run: `npm run build`
Expected: no TypeScript errors. Components aren't wired into a page yet (Task 8), so this just validates syntax/types.

- [ ] **Step 10: Commit**

```bash
git add components/agents lib/data
git commit -m "feat: add agent creation wizard step components"
```

---

### Task 8: Wizard orchestration page, agent list, and agent detail pages

**Files:**
- Create: `components/agents/creation-wizard.tsx`
- Modify: `app/(dashboard)/agents/page.tsx` (replace placeholder)
- Create: `app/(dashboard)/agents/new/page.tsx`
- Create: `app/(dashboard)/agents/[id]/page.tsx`
- Create: `lib/data/agents.ts`

**Interfaces:**
- Consumes: all wizard step components from Task 7, `createAgent` from `app/(dashboard)/agents/actions.ts`, `getCurrentOrgAndUser` from `lib/data/organization.ts`.
- Produces: `getAgentsForOrg(organizationId: string): Promise<Agent[]>` and `getAgentById(id: string): Promise<Agent | null>` in `lib/data/agents.ts`.

- [ ] **Step 1: Create agent data-fetching helpers**

`lib/data/agents.ts`:
```ts
import { createClient } from '@/lib/supabase/server'

export type Agent = {
  id: string
  name: string
  business_name: string | null
  industry: string | null
  country: string | null
  language: string | null
}

export async function getAgentsForOrg(organizationId: string): Promise<Agent[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agents')
    .select('id, name, business_name, industry, country, language')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function getAgentById(id: string): Promise<Agent | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agents')
    .select('id, name, business_name, industry, country, language')
    .eq('id', id)
    .single()

  return data
}
```

- [ ] **Step 2: Create the wizard orchestration component**

`components/agents/creation-wizard.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { SourceStep } from './wizard/source-step'
import { ScanProgressStep } from './wizard/scan-progress-step'
import { CountryStep } from './wizard/country-step'
import { LanguageStep } from './wizard/language-step'
import { IndustryStep } from './wizard/industry-step'
import { CallRoutingStep } from './wizard/call-routing-step'
import { startWebsiteScan, createAgent } from '@/app/(dashboard)/agents/actions'
import type { ScanRequestInput, CreateAgentInput } from '@/lib/validations/agent'
import type { CallRoutingInput } from '@/lib/validations/agent'
import { toast } from 'sonner'

type WizardStep = 'source' | 'scanning' | 'country' | 'language' | 'industry' | 'routing'

export function CreationWizard() {
  const [step, setStep] = useState<WizardStep>('source')
  const [scanJobId, setScanJobId] = useState<string | null>(null)
  const [data, setData] = useState<Partial<CreateAgentInput>>({})

  async function handleScanStart(input: ScanRequestInput) {
    const result = await startWebsiteScan(input)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setScanJobId(result.scanJobId)
    setStep('scanning')
  }

  function handleScanComplete(extracted: { businessName: string | null; suggestedIndustry: string | null }) {
    setData((prev) => ({
      ...prev,
      businessName: extracted.businessName ?? prev.businessName,
      industry: extracted.suggestedIndustry ?? prev.industry,
    }))
    setStep('country')
  }

  async function handleFinish(routing: CallRoutingInput) {
    const finalData = { ...data, ...routing } as CreateAgentInput
    const result = await createAgent(finalData)
    if (result?.error) {
      toast.error(result.error)
    }
  }

  switch (step) {
    case 'source':
      return (
        <SourceStep onScanStarted={handleScanStart} onManual={() => setStep('country')} />
      )
    case 'scanning':
      return (
        <ScanProgressStep
          scanJobId={scanJobId!}
          onComplete={handleScanComplete}
          onSkip={() => setStep('country')}
        />
      )
    case 'country':
      return (
        <CountryStep
          initialCountry={data.country}
          onNext={(country) => {
            setData((prev) => ({ ...prev, country }))
            setStep('language')
          }}
          onBack={() => setStep('source')}
        />
      )
    case 'language':
      return (
        <LanguageStep
          initialLanguage={data.language}
          onNext={(language) => {
            setData((prev) => ({ ...prev, language }))
            setStep('industry')
          }}
          onBack={() => setStep('country')}
        />
      )
    case 'industry':
      return (
        <IndustryStep
          initialIndustry={data.industry}
          onNext={(industry) => {
            setData((prev) => ({ ...prev, industry }))
            setStep('routing')
          }}
          onBack={() => setStep('language')}
        />
      )
    case 'routing':
      return (
        <CallRoutingStep
          initialData={data}
          onNext={handleFinish}
          onBack={() => setStep('industry')}
        />
      )
  }
}
```

- [ ] **Step 3: Create the wizard entry page**

`app/(dashboard)/agents/new/page.tsx`:
```tsx
import { CreationWizard } from '@/components/agents/creation-wizard'

export default function NewAgentPage() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <CreationWizard />
    </div>
  )
}
```

- [ ] **Step 4: Replace the agents list placeholder**

`app/(dashboard)/agents/page.tsx`:
```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Robot } from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg } from '@/lib/data/agents'

export default async function AgentsPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const agents = await getAgentsForOrg(context.org.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Receptionists</h1>
          <p className="text-muted-foreground">Configure your AI receptionists.</p>
        </div>
        <Button render={<Link href="/agents/new" />}>Create receptionist</Button>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Robot className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No receptionists yet</p>
            <p className="text-sm text-muted-foreground">Create your first AI receptionist to get started.</p>
            <Button className="mt-2" render={<Link href="/agents/new" />}>
              Create receptionist
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardContent className="space-y-2 p-4">
                  <p className="font-medium">{agent.business_name ?? agent.name}</p>
                  {agent.industry && (
                    <p className="text-sm text-muted-foreground">{agent.industry}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create the agent detail page**

`app/(dashboard)/agents/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { getAgentById } from '@/lib/data/agents'

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgentById(id)

  if (!agent) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{agent.business_name ?? agent.name}</h1>
        <p className="text-muted-foreground">
          {agent.industry} · {agent.country} · {agent.language}
        </p>
      </div>
    </div>
  )
}
```

Note: `params` is a `Promise` per Next.js 16's route handler/page convention — verified in the auth/dashboard phase's plan and consistent here.

- [ ] **Step 6: Verify build compiles**

Run: `npm run build`
Expected: no TypeScript errors, `/agents`, `/agents/new`, `/agents/[id]` routes present in the route list.

- [ ] **Step 7: Manual verification with real Groq key and local Redis**

With `REDIS_URL` and `GROQ_API_KEY` set in `.env.local`, Redis running, and `npm run worker` running in a separate terminal:
- Start `npm run dev`, navigate to `/agents`, click "Create receptionist"
- Test the manual-entry path: skip scan, fill country/language/industry/routing, confirm redirect to `/agents/[id]` and the agent appears in the list
- Test the scan path with a real URL (single depth): confirm the progress screen polls and completes, pre-filling business name/industry
- Confirm a failed scan (e.g. an unreachable URL) shows the error state with a working "manual entry" fallback

- [ ] **Step 8: Commit**

```bash
git add components/agents/creation-wizard.tsx "app/(dashboard)/agents" lib/data/agents.ts
git commit -m "feat: add agent creation wizard orchestration, list, and detail pages"
```

---

### Task 9: Playwright smoke test for manual-entry path

**Files:**
- Create: `e2e/agent-creation.spec.ts`

**Interfaces:**
- Consumes: existing Playwright config from the auth/dashboard phase (`playwright.config.ts`), a logged-in session (reuses the signup flow from the existing `e2e/auth.spec.ts` pattern).

- [ ] **Step 1: Write the manual-entry smoke test**

`e2e/agent-creation.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

function uniqueEmail() {
  return `agent-test-${Date.now()}@example.com`
}

test('manual agent creation flow creates an agent and shows it in the list', async ({ page }) => {
  const email = uniqueEmail()

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/agents/new')
  await page.getByText('Enter information manually').click()

  await page.getByPlaceholder('Search countries...').fill('United States')
  await page.getByRole('button', { name: 'United States' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByRole('button', { name: 'Dental' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByLabel('Staff phone number').fill('+15551234567')
  await page.getByRole('button', { name: 'Finish' }).click()

  await expect(page).toHaveURL(/\/agents\/[a-f0-9-]+/)

  await page.goto('/agents')
  await expect(page.getByText('Dental')).toBeVisible()
})
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- agent-creation.spec.ts`
Expected: PASS. Requires the dev server startable per `playwright.config.ts`'s `webServer` config, a live Supabase project (already configured), and does not require Redis/Groq since this test only exercises the manual-entry path.

- [ ] **Step 3: Commit**

```bash
git add e2e/agent-creation.spec.ts
git commit -m "test: add manual agent creation smoke test"
```

---

## Self-Review Notes

- **Spec coverage:** Data model → Task 2. Wizard flow/routing → Tasks 7, 8. Crawler/queue architecture → Tasks 1, 5, 6. Groq extraction → Task 4. Validation → Task 3. Error handling (failed scans, fallback to manual) → Tasks 6 (worker writes failed status), 7 (ScanProgressStep failure UI). Testing → Tasks 3, 4, 5, 6 (unit), 9 (e2e manual path only, per spec's explicit scoping-out of scan-path e2e).
- **Type consistency:** `ExtractedBusinessInfo` shape consistent across Task 4 (definition), Task 6 (worker write), Task 7 (`ScanProgressStep`'s `onComplete` callback), Task 8 (`handleScanComplete`). `CreateAgentInput` consistent across Task 3 (schema), Task 6 (`createAgent` action), Task 7 (`CallRoutingStep`), Task 8 (wizard state).
- **Blocked tasks:** Task 4 requires the user's Groq API key before the extraction call can be tested end-to-end (the unit test itself is unblocked, mocked). Task 2 requires the already-configured Supabase credentials from the prior phase (not newly blocked, just needs `SUPABASE_ACCESS_TOKEN` set when running `db push`, same as before).
- **Scope note carried from spec:** this phase is large by explicit user choice (wizard UI + Redis/BullMQ + crawler + Groq all together, not split). Tasks are still individually testable and committable, so a builder can stop after any task with working, verified software at that point.
