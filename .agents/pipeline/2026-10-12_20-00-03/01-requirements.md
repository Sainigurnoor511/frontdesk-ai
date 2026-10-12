# Requirements — E2E test harness (Playwright)

## Summary

Frontdesk.ai has no end-to-end coverage. `@playwright/test` sits in `devDependencies`, but there is no
Playwright config, no `e2e/` directory, and no spec files. This work stands up a minimal, genuinely
executed Playwright harness in the `feat/e2e-harness` worktree
(`e:\Projects\frontdesk-ai\.worktrees\e2e-harness`, branch `feat/e2e-harness`): a config that can boot the
app itself, pnpm scripts for headless and interactive runs, a handful of specs on paths that do not need a
logged-in session, a short `e2e/README.md`, and ignore rules for Playwright artifacts. The harness must
coexist with the existing Vitest suite without either runner picking up the other's files.

The bar is reliability, not breadth. Three to four specs that pass every run beat a wide suite nobody
trusts. Load testing is explicitly deferred — only a short note about future targets is in scope.

## Context established by reading the repo

- Package manager is pnpm; `pnpm dev` (Next 16.4 dev server), `pnpm build` + `pnpm start`
  (`output: "standalone"`, `postbuild` copies `public/` and static assets into `.next/standalone`).
- `vitest.config.ts` sets only `exclude: ['**/node_modules/**', '**/.claude/worktrees/**']`, so Vitest's
  default include glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) **would** collect Playwright specs named
  `*.spec.ts`. This collision is real and must be handled deliberately.
- `tsconfig.json` includes `**/*.ts` repo-wide, so new spec files are inside the typecheck surface;
  `pnpm exec tsc --noEmit` must stay clean.
- Request interception lives in `proxy.ts` (`updateSession` only — it refreshes the Supabase cookie and
  does not redirect). Auth gating happens in `app/(dashboard)/layout.tsx`, which calls
  `getCurrentOrgAndUser()` and `redirect('/login')` when there is no session. `/` itself is a dashboard
  route, so an unauthenticated hit on `/` lands on `/login`.
- `components/auth/login-form.tsx` is a client form with a `zodResolver(loginSchema)`. Malformed input
  renders inline `<p class="text-sm text-destructive">` errors with no network call. Wrong-but-well-formed
  credentials go through the `logIn` server action and surface as a **sonner toast**, which requires a
  reachable Supabase project.
- `app/smb/[slug]/page.tsx` resolves the org by slug and calls `notFound()` unless
  `settings.bookingPageEnabled` is true (or `?preview=1` with an authenticated member). So a passing
  booking-page spec needs seeded data; the slug cannot be hardcoded.
- Only `.github/workflows/migrations.yml` exists today; it is the model for any new workflow.
- The worktree has no `node_modules` and no `.env.local`; `.env.local` exists in the main checkout and may
  be copied in.

## Functional Requirements

### FR1 — Playwright config

1. A new `playwright.config.ts` at the worktree root, typed with `defineConfig` from `@playwright/test`.
2. `testDir` points at a new top-level `e2e/` directory.
3. `use.baseURL` is configurable via env (default `http://localhost:3000`) so specs navigate with relative
   paths.
4. A `webServer` entry lets the suite boot the app itself, with `reuseExistingServer` when not on CI, and a
   startup timeout generous enough for a cold Next.js start on Windows.
5. Timeouts (per-test and per-expect), `retries` (more on CI than locally), `trace` and `screenshot`
   captured on failure, and a reporter suited to both local and CI runs.
6. Exactly one browser project: chromium.

### FR2 — Scripts

1. `pnpm test:e2e` runs the suite headless.
2. A second script provides the interactive/UI mode (Playwright's UI runner).
3. Both live in `package.json` next to the existing scripts. `package.json` is owned by this run, so no
   other scripts may be changed.

### FR3 — Runner isolation (Vitest vs Playwright)

1. `pnpm test` must behave exactly as it does today: same files collected, no Playwright specs picked up.
2. Playwright must not collect Vitest's co-located `*.test.ts(x)` files.
3. Isolation must be enforced explicitly — by spec naming, by a Vitest `exclude` entry for `e2e/**`, or
   both — not left to default globs happening to agree.
4. A Playwright spec importing `@playwright/test` must never be loadable by Vitest, since
   `@playwright/test`'s `test`/`expect` globals clash with Vitest's.

### FR4 — Specs (unauthenticated, must pass)

1. **Login page renders.** `/login` loads and shows the sign-in heading, the email and password fields, and
   the submit control.
2. **Login rejects bad credentials with a visible error.** Submitting invalid input produces a visible
   error message. This must be deterministic: the client-side Zod path (malformed email / too-short
   password, inline `text-destructive` message) requires no backend and is the preferred assertion. If a
   wrong-password-against-real-Supabase assertion is added, it must be gated on the env being configured
   and skip with a clear reason otherwise.
3. **Unauthenticated dashboard access redirects.** Navigating to a dashboard route while unauthenticated
   ends on `/login`.
4. **Public booking page loads for a known slug.** The slug comes from an env var (not hardcoded); when it
   is unset the spec skips with a message naming the variable and what the org must look like
   (`booking_page_enabled`). When set, the page renders its booking UI rather than the 404 body.
5. Specs use accessible, user-facing locators (roles, labels, visible text) over brittle CSS selectors,
   consistent with the app's accessibility conventions.
6. Turnstile, if it blocks any asserted flow, is handled with Cloudflare's documented always-pass test
   keys. Do not attempt to bypass or stub the widget itself.

### FR5 — Authenticated journey (conditional)

1. One authenticated journey is added **only if** it can be made deterministic. A programmatic Supabase
   session (seeded test user, session cookie injected via storage state) is preferred over driving the
   login form.
2. If determinism is not achievable in this environment, it ships as a documented skipped spec stating
   exactly what seed data, env vars, and setup would make it run. A flaky authenticated spec is a failure,
   not a partial win.

### FR6 — Docs

1. A new `e2e/README.md` — the only doc file this run owns — covering: how to run headless and UI mode,
   required env vars and seed data, which specs skip and why, how to add a new spec (naming convention and
   isolation rule from FR3), and where artifacts land.
2. It also records what a future load-testing pass would target (the voice path and the booking endpoints)
   and states that load testing was out of scope here.
3. `developer-docs/TODO.md` and the root `README.md` must not be touched — the orchestrator owns those.

### FR7 — Artifacts and ignores

1. `.gitignore` gains `test-results/`, `playwright-report/`, and `.playwright/` so Playwright output is
   never committed.
2. No Playwright artifacts appear in `git status` after a run.

### FR8 — CI (optional)

1. If a GitHub Actions workflow is added, it is modelled on `.github/workflows/migrations.yml`
   (explicit `permissions`, pinned action majors, documented required secrets).
2. It must not be able to block merges while the suite is new: `workflow_dispatch` only, or a job that does
   not gate, or `continue-on-error`. This must be visible in the workflow file, not just intended.
3. Skipping CI entirely is an acceptable outcome; if skipped, `e2e/README.md` says so.

## Non-Functional Requirements

1. **Scope discipline.** Files this run may create or modify: `playwright.config.ts`, everything under
   `e2e/`, `package.json` scripts, `.gitignore`, and optionally one `.github/workflows/*.yml`. Application
   source under `app/`, `lib/`, `components/`, and `workers/` is off limits. A test that uncovers an
   application bug is **reported, not fixed**.
2. **Branch discipline.** Work and commit on `feat/e2e-harness` inside the worktree. Do not merge, rebase,
   or touch `main`; do not edit the main checkout at `e:\Projects\frontdesk-ai`.
3. **Secrets.** `.env.local` may be copied from the main checkout into the worktree, but no secret value
   may be printed in output, committed, or written into a spec or the README.
4. **Determinism.** No spec may depend on wall-clock timing, network flakiness, or data it did not create
   or verify. Prefer web-first assertions and auto-waiting over fixed sleeps.
5. **Typecheck and lint.** `pnpm exec tsc --noEmit` stays clean. ESLint is run scoped to the changed files
   only; full-repo `pnpm lint` has 29 pre-existing errors and is not a gate.
6. **Windows-first.** The suite must run on the developer's Windows/pwsh environment; no POSIX-only shell
   syntax in scripts or `webServer.command`.
7. **Next.js 16.4.** Verify dev/build/start behaviour against `node_modules/next/dist/docs/` rather than
   assuming older Next.js conventions.

## Acceptance Criteria

1. `playwright.config.ts` exists at the worktree root with `testDir` set to `e2e/`, a `baseURL`, a
   `webServer` entry, per-test and expect timeouts, CI-aware retries, trace and screenshot on failure, and a
   single chromium project.
2. `pnpm test:e2e` exists and, when run inside the worktree, executes the suite and reports all non-skipped
   specs passing. The run output is shown as evidence. If any spec cannot pass in this environment, that is
   stated explicitly with the reason instead of being claimed as a pass.
3. An interactive/UI-mode script exists in `package.json` and launches Playwright's UI runner.
4. `pnpm test` (Vitest) runs and its failure set matches the 2026-10-08 baseline exactly — 10 failures
   across `app/smb/actions.test.ts`, `lib/data/analytics.test.ts`, `lib/data/availability-engine.test.ts`,
   `lib/voice/adapters/fish-audio-tts.test.ts` — with no additional failures and no e2e spec collected.
   Verified by comparing the before/after Vitest file lists.
5. `pnpm exec playwright test --list` shows only specs under `e2e/`, and no `*.test.ts(x)` file from
   `app/`, `lib/`, or `components/`.
6. The `/login` render spec passes against a locally booted app.
7. The bad-credentials spec passes and asserts a *visible* error element, not merely that navigation did
   not occur.
8. The unauthenticated-redirect spec passes and asserts the final URL path is `/login`.
9. The booking-page spec either passes against a configured slug or skips with a message naming the
   required env var and the `booking_page_enabled` prerequisite. It never fails due to missing seed data.
10. Any authenticated spec either passes deterministically on repeat runs, or is `test.skip` with a comment
    documenting the required setup.
11. `e2e/README.md` exists and covers run commands, env vars and seed data, skip reasons, how to add a spec,
    and the future load-testing note.
12. `.gitignore` contains `test-results/`, `playwright-report/`, and `.playwright/`; `git status` is clean of
    Playwright artifacts after a full run.
13. `pnpm exec tsc --noEmit` exits 0.
14. `pnpm exec eslint` over the changed files reports no new errors.
15. `git diff --name-only main...feat/e2e-harness` lists only files from the ownership set in NFR1 — in
    particular no `app/`, `lib/`, `components/`, `workers/`, `README.md`, or `developer-docs/TODO.md`
    entries, and no changes to `vitest.config.ts` beyond an `exclude` addition if that route is taken.
16. Work is committed on `feat/e2e-harness` with a clear message; `main` is untouched and unmerged.
17. The final report is two or three sentences on what shipped and how to run it, plus any application bugs
    observed (reported, not fixed).

## Out of Scope

- **Load testing.** No k6/Artillery/autocannon scripts, no load CI. Only a forward-looking note in
  `e2e/README.md`.
- Browsers beyond chromium (no firefox, webkit, or mobile emulation projects).
- Visual regression / screenshot-diff testing and accessibility scanning (axe).
- Voice-path E2E (LiveKit rooms, AssemblyAI WebSocket), background-job (BullMQ) E2E, and webhook E2E.
- Broad coverage of authenticated dashboard surfaces — onboarding, agents, conversations, settings,
  integrations, analytics.
- Supabase seed scripts, migrations, or test-data fixtures committed to the repo; prerequisites are
  documented, not automated.
- Any fix to application code, including bugs the new specs reveal.
- Edits to `developer-docs/TODO.md` and the root `README.md`; merging the branch.

## Assumptions

1. **Vitest isolation approach is the implementer's call**, but it must be explicit. Naming Playwright files
   so Vitest's default glob cannot match them (e.g. `e2e/*.e2e.ts` with Playwright's `testMatch` widened) is
   the lowest-conflict option because it leaves `vitest.config.ts` untouched. Adding `'e2e/**'` to Vitest's
   `exclude` is also acceptable — `vitest.config.ts` is not in the forbidden set and no other parallel run
   is expected to touch it — but it is a second file outside the stated ownership list, so prefer naming
   first and add the exclude only as belt-and-braces.
2. **`webServer` runs the dev server** (`pnpm dev`). It is faster to start and needs no `pnpm build`, and
   the specs assert routing/rendering rather than production-build behaviour. If dev-mode compile latency
   makes the first navigation unreliable, the production path (`pnpm build` + `pnpm start`) is the
   fallback — and the choice is documented in `e2e/README.md`.
3. **Supabase reachability.** The baseline specs must pass with whatever `.env.local` from the main checkout
   provides. The `/login` render and the unauthenticated-redirect specs do not need a working Supabase
   project (the redirect happens when there is no session, including when the auth call fails). Only the
   booking-page and any authenticated spec depend on real data, which is why both are env-gated.
4. **Dashboard route for the redirect spec** is `/` (the root dashboard page) or another route under
   `app/(dashboard)`; the implementer picks one and asserts the resulting `/login` path.
5. **`pnpm install` and `pnpm exec playwright install chromium`** must be run inside the worktree before
   anything else; this is setup, not a deliverable.
6. **Turnstile test keys** are expected to be needed only if an asserted interaction submits the protected
   booking form. Rendering the booking page is likely enough for the spec in FR4.4, so no Turnstile key may
   be required at all.
7. **Baseline capture.** The 10-failure Vitest baseline from the brief is taken as given, but it will be
   re-measured before any change so the comparison in AC4 is against this machine's actual state.
8. **CI is likely skipped** for this run given the suite's dependence on seeded Supabase data; if added, it
   will be `workflow_dispatch`-only.
