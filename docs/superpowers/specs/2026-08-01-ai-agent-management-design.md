# Design: AI Agent Management

Date: 2026-08-01
Status: Approved (pending spec review)

## Context

Second sub-project of the FrontDesk.ai platform build-out, following Auth + Organizations + Dashboard Shell (see `2026-08-01-auth-orgs-dashboard-shell-design.md`). This phase makes the sidebar's "Receptionists" section functional: creating, listing, and configuring AI receptionist agents via a guided onboarding wizard, matching the reference product's (Reception.ai / ElevenLabs) first-run flow shown in screenshots (`docs/onboarding screens/`).

Out of scope (future phases): actual live voice calls (inbound calling pipeline), calendar tool wiring, knowledge base / RAG document indexing, CRM contact creation from calls. This phase creates the agent's *configuration* only — the agent doesn't answer real calls yet.

## Scope

In scope:
- `agents` and `agent_scan_jobs` database tables with RLS
- Multi-agent support per organization
- 5-step creation wizard: source (scan/manual) → country → language → industry → call routing
- Real website scanning: single-page, quick (root + heuristic-selected pages), and deep (bounded BFS crawl) modes
- Groq LLM extraction of business name/hours/services/industry from crawled text
- Redis + BullMQ background job queue for the scan (using user's local Redis: `redis://localhost:6379/0`)
- A standalone worker process for processing scan jobs
- Agent list page and agent detail/edit page (reusing wizard field groups)
- `lib/providers/llm/groq.ts` as the first concrete provider-adapter implementation

Out of scope: tool definitions becoming functional (calendar booking, knowledge base search) — columns/structure may exist but behavior is deferred to those phases; voice pipeline; multi-page crawl content deduplication beyond basic same-URL skip.

## Data Model & Scope

```sql
agents (
  id uuid primary key,
  organization_id uuid references organizations(id),
  name text not null,
  business_name text,
  country text,
  language text,
  industry text,
  greeting_prompt text,
  personality_notes text,
  answering_mode text check (answering_mode in ('staff_first', 'agent_first')),
  staff_phone_number text,
  max_ring_seconds integer default 20,
  hold_music text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

agent_scan_jobs (
  id uuid primary key,
  agent_id uuid references agents(id),
  url text not null,
  scan_depth text check (scan_depth in ('single', 'quick', 'deep')),
  status text check (status in ('pending', 'running', 'completed', 'failed')) default 'pending',
  extracted_data jsonb,
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
)
```

RLS: both tables scoped by the requesting user's organization membership, following the same `members`-lookup pattern established in the auth/orgs phase. `agent_scan_jobs` is scoped via its parent `agent_id`'s `organization_id`.

Multiple agents per organization are supported — no uniqueness constraint on agent count. Tool-definition fields (calendar hooks, knowledge base search) are deliberately not added to this schema; they will arrive as additive migrations when the Calendar and Knowledge Base phases are built, avoiding speculative columns that stay unused.

## Wizard Flow & Routing

- `app/(dashboard)/agents/page.tsx` — list view: grid of existing agents (name, industry badge), "Create receptionist" primary action. Empty state directs to the wizard when the org has zero agents.
- `app/(dashboard)/agents/new/page.tsx` — wizard entry.
  - **Step 1 (source):** "Scan my website" vs. "Enter information manually" choice.
    - Scan path: URL input → scan-depth picker (Single page / Quick scan / Deep scan, matching the reference copy) → creates an `agent_scan_jobs` row and enqueues a BullMQ job → progress screen polling job status → on completion, pre-fills business name/hours/services/industry into subsequent steps.
    - Manual path: skips directly to Step 2 with empty fields.
  - **Step 2 (country):** searchable grid of countries.
  - **Step 3 (language):** agent's spoken language (English, Hindi to start; extensible list).
  - **Step 4 (industry):** grid of industry cards; pre-selected if the scan inferred one, otherwise blank.
  - **Step 5 (call routing):** answering mode (staff-first / agent-first), staff phone number, max ring time, hold music selection.
  - On finish: creates the `agents` row via a server action, redirects to `/agents/[id]`.
- `app/(dashboard)/agents/[id]/page.tsx` — detail/edit view, reusing the same field groups as the wizard steps for post-creation editing.
- Wizard state lives in client-side React state across steps; nothing is persisted to the database until the final step completes, so an abandoned wizard leaves no orphaned agent row. (The `agent_scan_jobs` row from a scan attempt may persist even if the wizard is abandoned — acceptable, as it's inert data with no cost beyond a DB row.)

## Crawler & Queue Architecture

- `lib/queue/connection.ts` — `ioredis` client configured from `REDIS_URL` env var.
- `lib/queue/queues/scan-website.ts` — BullMQ queue definition for scan jobs.
- `workers/scan-website.ts` — standalone worker process, run via a separate `npm run worker` script (per the design doc's background-worker pattern), listens on the scan-website queue and processes jobs outside the Next.js request/response cycle.
- `lib/crawler/` — crawl logic, using `cheerio` (new dependency) for HTML text extraction:
  - **Single:** fetch the provided URL only, extract visible text.
  - **Quick:** fetch the root page plus up to ~5 same-domain links matching path heuristics (about, services, contact, hours, pricing), budget-capped and timeout-bounded.
  - **Deep:** bounded BFS crawl of same-domain pages, capped at ~20 pages and depth 2, timeout-bounded to stay within the "4–5 minutes" framing shown in the reference UI.
  - `robots.txt` is fetched and parsed before any crawl requests; disallowed paths are skipped. The crawler identifies itself with an honest User-Agent (`FrontDeskAI-Bot/1.0`).
- Extraction: concatenated page text is sent to Groq (`lib/providers/llm/groq.ts`, the first concrete implementation of the provider-agnostic `LLMProvider` interface) in a single call requesting structured JSON output (business name, hours, services list, suggested industry). Result is stored in `agent_scan_jobs.extracted_data`.
- The wizard polls scan status via a server action (`getScanJobStatus(jobId)`) every ~2 seconds while `status` is `pending` or `running`. Polling is chosen over WebSockets/SSE for simplicity at this scope; can be revisited if real-time feels necessary later.

## Validation, Error Handling, Testing

- Zod schemas per wizard step: URL validation for the scan input, required-field validation for manual entry, phone number format validation for call routing.
- Crawl failures (unreachable URL, timeout, robots.txt fully disallowing, non-HTML content) set `agent_scan_jobs.status = 'failed'` with a populated `error_message`. The wizard surfaces this inline and offers a "switch to manual entry" fallback — it never silently stalls on a failed scan.
- Groq API failures (rate limit, timeout, malformed response) follow the same failed-job path with a distinct error message.
- Testing: Vitest unit tests for extraction-response parsing (mocked Groq response → structured data), Zod schema tests per wizard step, crawler budget/depth-limit logic (mocked fetch, no real network calls in unit tests). A Playwright smoke test covers the manual-entry path end-to-end (create agent → appears in list). The scan path is not covered by automated e2e tests, since it depends on real external network access and would be flaky in CI; it is verified manually during implementation.

## Open Questions / Deferred

- Tool definitions (calendar booking, knowledge base search) becoming functional: deferred to the Calendar and Knowledge Base phases respectively.
- Real-time scan progress (WebSockets/SSE instead of polling): deferred unless polling proves inadequate in practice.
- Crawl content deduplication beyond same-URL skip (e.g. near-duplicate page detection): deferred, not needed at current crawl budgets.
