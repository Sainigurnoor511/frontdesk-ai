# Design review — E2E test harness (Playwright), revision 3

Reviewed `02-design.md` (revision 3) against `01-requirements.md`. Every claim the design makes
about existing code was re-checked against source in `e:\Projects\frontdesk-ai\.worktrees\e2e-harness`
and against the installed dependency tree. The worktree has **no `node_modules`** (confirmed:
`Test-Path node_modules` → `False`), so library internals were verified in the main checkout's
`node_modules`, whose versions match the worktree's committed `pnpm-lock.yaml`
(`@playwright/test@1.62.1`, `@supabase/ssr@0.12.4`, `@supabase/postgrest-js@2.112.2`, `next@16.4.0`,
`dotenv@17.4.2`). `git diff --stat main...feat/e2e-harness` is empty, so nothing has been written yet.

Verdict: **CHANGES_REQUESTED** — 0 HIGH, 3 MEDIUM, 6 NIT.

The revision-2 findings are genuinely addressed; the three MEDIUMs below are new, and two of them
(1 and 3) are holes the previous rounds did not reach rather than regressions.

---

## Findings

### 1. MEDIUM — The two data-dependent gates omit the Supabase precondition, so a partial configuration turns a skip into a hard failure

**Where:** `e2e/booking-page.e2e.ts` (live-slug test), `e2e/auth-live.e2e.ts` (journey test),
`e2e/support/env.ts`.

The live-slug test gates on `!e2eEnv.bookingSlug` alone, and the journey test on
`!e2eEnv.userEmail || !e2eEnv.userPassword` alone. Neither requires a Supabase project to be
configured, and the design's own placeholder mechanism guarantees one is *not* when those variables
are absent.

Verified consequences:

- `getOrganizationBySlug` (`lib/data/organization-slug.ts:33-41`) calls `createServiceRoleClient()`,
  which reads `NEXT_PUBLIC_SUPABASE_URL` **and `SUPABASE_SECRET_KEY`**
  (`lib/supabase/service-role.ts:5-7`). With only `E2E_BOOKING_SLUG` set, `playwright.config.ts`
  injects `http://127.0.0.1:1` / `e2e-placeholder-secret-key`, the lookup resolves to `null`
  (postgrest converts the fetch error to `{data: null, status: 0}` — verified at
  `@supabase/postgrest-js/dist/index.cjs:421-434`), the route renders the 404 body, and the test
  fails its `[data-booking-public-root]` assertion. AC9 says this spec "never fails due to missing
  seed data".
- The journey drives the real login form through `signInWithPassword`
  (`app/(auth)/actions.ts:85`). Against a placeholder project it can never succeed, so it fails
  rather than skipping. AC10 requires pass-deterministically-or-skip.
- This is not a hypothetical: `.github/workflows/e2e.yml` binds all six secrets independently and
  its comment block states each is optional, so "slug set, Supabase unset" is a configuration the
  design's own CI invites.

Also note `supabaseConfigured` checks two of the three Supabase keys, which is correct for the
auth-only toast test but not for the service-role booking path — the name overstates what it proves.

**Fix.** Add a second getter and widen both gates:

```ts
// e2e/support/env.ts — rename for accuracy and add the service-role gate
get authConfigured(): boolean {
  return Boolean(
    readEnv('NEXT_PUBLIC_SUPABASE_URL') && readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  )
},
get serviceRoleConfigured(): boolean {
  return Boolean(readEnv('NEXT_PUBLIC_SUPABASE_URL') && readEnv('SUPABASE_SECRET_KEY'))
},
```

```ts
// e2e/booking-page.e2e.ts
test.skip(
  !e2eEnv.serviceRoleConfigured || !e2eEnv.bookingSlug,
  'Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (the slug is resolved with the service-role client) and E2E_BOOKING_SLUG pointing at an organization whose organization_settings.booking_page_enabled is true'
)
```

```ts
// e2e/auth-live.e2e.ts — journey
test.skip(
  !e2eEnv.authConfigured || !e2eEnv.userEmail || !e2eEnv.userPassword,
  'Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY plus E2E_USER_EMAIL and E2E_USER_PASSWORD for a Supabase user that owns an organization'
)
```

Keep `authConfigured` as the toast test's gate. Update the env table and the README skip list to
name the Supabase variables as co-preconditions for both gated data tests.

---

### 2. MEDIUM — The locator-policy claim contradicts the specs in the same section, and the FR4.5 deviation is missing from the declared-deviations list

**Where:** "Specs" section opening line; `e2e/booking-page.e2e.ts`; `e2e/auth-live.e2e.ts`;
the deviations paragraph and the `e2e/README.md` outline's "Deviations from the requirements" bullet.

The section opens with "All locators are role/label/text based per FR4.5" and then uses two raw CSS
selectors: `page.locator('[data-booking-public-root]')` and
`page.locator('[data-sonner-toast][data-type="error"]')`. Both selectors are *correct* — I verified
`data-booking-public-root` exists on the client root (`app/smb/[slug]/booking-page-public-client.tsx:470`,
exactly one occurrence) and that sonner 2.0.7 emits `data-sonner-toast=""` and `data-type=<type>`
(`sonner/dist/index.mjs:648,662`). The problem is the false blanket statement plus the fact that
FR1.3 and FR5.1 are carried into the README's deviations bullet and the final report while FR4.5 is
not, so this one silently disappears at hand-off.

**Fix.** Replace the opening sentence with something true and add the third deviation:

> All locators are role/label/text based per FR4.5, with two deliberate exceptions, both structural
> attributes rather than styling hooks: `[data-booking-public-root]` on the booking page (every
> visible string there is switchable through `booking_page_config`) and
> `[data-sonner-toast][data-type="error"]` for the toast (sonner exposes no role/name for the
> error variant). Both are listed as the FR4.5 deviation in `e2e/README.md` and the final report.

and extend the README outline's deviations bullet to three items (FR1.3 port, FR4.5 two attribute
locators, FR5.1 form-driven sign-in).

---

### 3. MEDIUM — Run A → Run B can silently reuse the Run A dev server, which would invalidate the AC2 evidence

**Where:** "Testability and verification" steps 5–7; `webServer.reuseExistingServer`.

The plan's whole structure depends on the dev server being restarted between Run A (bare worktree,
placeholder Supabase injected into the child) and Run B (`.env.local` copied in, real values passed
through). But `reuseExistingServer: !process.env.CI` is `true` locally, and Playwright's webServer
plugin checks availability *before* it ever considers the command
(`playwright/lib/runner/index.js:842-851`) and returns silently on reuse. If anything is already
listening on 3100 — a leftover `next dev` that survived a kill, or the developer's own — Run B
attaches to a process whose env is still the Run A placeholder set, while the runner's
`e2eEnv.supabaseConfigured` reads `true` from the freshly copied `.env.local`.

The failure is quiet rather than loud: the toast test's tolerant regex accepts
`Something went wrong. Please try again.`, which is exactly what `friendlyAuthError`
(`app/(auth)/actions.ts`) returns for an unreachable project, so Run B would be reported as
"5 passed" while having proved nothing new. The error-handling table covers only a *foreign* server
on port 3000, not a stale server of our own on 3100.

**Fix.** Make the port check an explicit precondition of both acceptance runs (keep
`reuseExistingServer: !process.env.CI` — FR1.4 asks for it):

```powershell
# verification steps 5 and 7, before each run: the port must be free, or the run is invalid
if (Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port 3100 is already in use - stop it or set $env:E2E_PORT before running the acceptance suite'
}
pnpm test:e2e
```

and add a sentence to step 7 stating that Run B is only valid if the run started its own server, so
the reported pass is attributable to the copied `.env.local`.

---

### 4. NIT — The FR1.3 `baseURL` default deviation is declared but should be tracked as a requirement change, not just documented

The requirement states `use.baseURL` defaults to `http://localhost:3000`; the design uses
`http://127.0.0.1:3100`. The reasoning (concurrent worktree dev servers, IPv6-first resolution
stalls on Windows) is sound and the override is documented, but AC15-style hand-off reviews read the
requirements, not the design. **Fix:** keep the deviation and add one line to the final report in
the form "FR1.3 default changed from `http://localhost:3000` to `http://127.0.0.1:3100`; restore with
`E2E_PORT=3000` + `E2E_BASE_URL=http://localhost:3000`", so the requirement doc can be amended
rather than quietly contradicted.

### 5. NIT — Booking spec interpolates a `string | null`

`page.goto(`/smb/${e2eEnv.bookingSlug}`)` typechecks but would navigate to `/smb/null` if the gate
above it ever changed, because `test.skip()` does not narrow the type. `auth-live.e2e.ts` uses `!`
for the same situation, so the two files disagree stylistically too. **Fix:**
`await page.goto(`/smb/${e2eEnv.bookingSlug!}`)`.

### 6. NIT — `globalSetup` skips warming in the one case that most needs it

`global-setup.ts` returns early when `E2E_NO_WEB_SERVER` is set, on the rationale "if we did not
start the server, we do not presume to warm it". But `E2E_NO_WEB_SERVER`'s documented meaning is
"something is already listening on `E2E_PORT`" — which includes a hand-started `pnpm dev` whose
routes are cold, i.e. precisely the case the warm-up exists for. The warm-up is a best-effort GET
against the same origin the specs use, so warming it is harmless. **Fix:** gate only on the
foreign-origin flag:

```ts
if (readEnv('E2E_BASE_URL')) return
```

and keep the `E2E_NO_WEB_SERVER` branch warming. (Leave the production-build fallback as is — a
prebuilt server simply answers fast and the warm-up costs three requests.)

### 7. NIT — Env table does not say `E2E_PORT` is inert when `E2E_BASE_URL` is set

`useWebServer` is false whenever `E2E_BASE_URL` is set, so `E2E_PORT` affects nothing in that mode,
yet it is still validated and still appears in the table as "defaults to `3100`". **Fix:** append to
the `E2E_PORT` row: "ignored when `E2E_BASE_URL` is set (no server is booted); still validated, so a
malformed value throws either way".

### 8. NIT — CI job has no `timeout-minutes`

`webServer.timeout` is 180 s, but a dev server that answers slowly rather than never, or a hung
Chromium, would run against GitHub's default job timeout. `migrations.yml` has no precedent here
because its steps are short. **Fix:** add `timeout-minutes: 30` to the `e2e` job alongside
`runs-on`.

### 9. NIT — The journey's URL regex matches any path ending in a slash

`toHaveURL(/\/(onboarding)?$/)` matches `http://host/`, `http://host/onboarding`, and also
`http://host/anything/`. Nothing in the app currently produces a third case, but the assertion is
the thing that proves the session took, so it is worth making exact. Playwright 1.62 accepts a URL
predicate (`toHaveURL(url: string|RegExp|URLPattern|((url: URL) => boolean), ...)`, verified at
`playwright/types/test.d.ts:10189`). **Fix:**

```ts
await expect(page).toHaveURL((url) => url.pathname === '/' || url.pathname === '/onboarding', {
  timeout: 30_000,
})
```

---

## Verified Assumptions

Each item below was checked in source, not taken from the design.

**Application behaviour**

1. `proxy.ts` matcher `'/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'`
   covers `/`, `/login` and `/smb/*`. `updateSession` passes
   `process.env.NEXT_PUBLIC_SUPABASE_URL!` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!` into
   `createServerClient` (`lib/supabase/middleware.ts:8-9`). ✅
2. `@supabase/ssr@0.12.4` `createServerClient` first statement is
   `if (!supabaseUrl || !supabaseKey) throw new Error("Your project's URL and Key are required…")`
   (`dist/main/createServerClient.js:11-13`) — a `''` throws exactly like `undefined`, so the
   placeholder-not-empty-string rule is load-bearing as described. ✅
3. `@next/env@16.4.0` `processEnv` applies a `.env.local` key only when
   `typeof u[t] === "undefined" && typeof p[t] === "undefined"`, where `p` is a copy of the
   `initialEnv` snapshot. A blank inherited value therefore suppresses the real `.env.local` value —
   exactly as the design claims. ✅
4. `app/(dashboard)/layout.tsx:15-19` → `getCurrentOrgAndUser()` returns `null` when
   `auth.getUser()` yields no user (`lib/data/organization.ts:13-15`) and the layout calls
   `redirect('/login')`. `app/(dashboard)/page.tsx` exists, so `/` is a dashboard route. ✅
5. `app/(auth)/login/page.tsx` renders `<h1>Welcome back</h1>`, `GoogleButton label="Sign in with Google"`,
   then `LoginForm`. `Toaster` is mounted in the **root** layout (`app/layout.tsx`), so toasts render
   on `/login`. ✅
6. `components/auth/login-form.tsx`: `<Label htmlFor="email">Email</Label>` /
   `<Label htmlFor="password">Password</Label>`, inputs carry matching `id`s, and
   `InputGroupInput` spreads `...props` onto `Input` (`components/ui/input-group.tsx:119-132`), so
   `getByLabel` resolves. Submit button name is `Sign in` (`Signing in…` only while submitting); the
   visibility toggle's `aria-label` is `Show password`/`Hide password`. `exact: true` is required on
   both "Sign in" and "Password" because Playwright's `name`/label matching is case-insensitive
   substring by default. ✅
7. `loginSchema` is `password: z.string().min(1, 'Password is required')`
   (`lib/validations/auth.ts:12-13`) and the error renders as
   `<p className="text-sm text-destructive">`. The form has no `noValidate` and the email input is
   `type="email"`, so the design's choice of the empty-password branch over a malformed email is the
   correct one. ✅
8. `app/smb/[slug]/page.tsx` calls `getOrganizationBySlug` twice — once in `generateMetadata`, once
   in the page component — with no `React.cache()` wrapper. `getOrganizationBySlug` destructures
   only `data`, so an unreachable database yields `null` → `notFound()`. ✅
9. `app/smb/[slug]/not-found.tsx` renders `<h1>Booking page not found</h1>` inside a `<main>`. ✅
10. `data-booking-public-root` exists exactly once, on the `BookingPagePublicClient` root
    (`app/smb/[slug]/booking-page-public-client.tsx:470`), outside every config-dependent branch. ✅
11. `friendlyAuthError` emits `Incorrect email or password.`, `Too many attempts. Please wait a few
    minutes and try again.`, and the fallback `Something went wrong. Please try again.` — the spec's
    regex covers all three. `logIn` ends in `redirect('/')` (`app/(auth)/actions.ts:91`). ✅
12. Exactly one `<main>` per rendered route: `app/(auth)/layout.tsx`, `app/not-found.tsx`,
    `app/smb/[slug]/not-found.tsx`, `components/onboarding/onboarding-ui.tsx`, and
    `components/ui/sidebar.tsx:307` (`SidebarInset`). No file contains two. ✅
13. `IntroSequence` phases at 700 / 1800 / 2800 ms (`components/onboarding/intro-sequence.tsx:14-19`)
    and emits no `<main>`, so the 10 s expect timeout covers it. ✅
14. Turnstile is dead code: `if (false && turnstileSecret)` at `app/smb/actions.ts:89` and `:325`,
    and `components/voice/turnstile.tsx` has no importers anywhere in `app/`, `components/`, `lib/`.
    FR4.6 is genuinely moot. ✅
15. `lib/seo/site.ts` `siteUrl()` falls back to `http://localhost:3000` rather than throwing, so the
    root layout's `metadataBase: new URL(siteUrl())` cannot crash on a bare worktree. (The design
    never mentions this; it happens to hold.) ✅

**Library and tooling behaviour**

16. `@supabase/postgrest-js@2.112.2`: `DEFAULT_MAX_RETRIES = 3` (`dist/index.cjs:7`),
    `getRetryDelay = Math.min(1e3 * 2 ** i, 3e4)` (`:15`), `retryEnabled` defaults to `true`
    (`:214`, `:225`), fetch-error retry at `:373`. 1 + 2 + 4 = 7 s per call, two calls per
    `/smb/[slug]` render ≈ 14 s. Fetch failures resolve to `{data: null, status: 0}` rather than
    rejecting (`:421-434`). The timing budget's premise is real. ✅
17. Playwright 1.62.1 webServer child env is
    `{...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...this._options.env}`
    (`runner/index.js:858-862`), so `webServer.env` wins last. ✅
18. Task order is `createRemoveOutputDirsTask → createPluginSetupTasks → globalTeardowns →
    globalSetups` (`runner/index.js:6003-6008`), so the dev server is up before `globalSetup`
    runs. ✅
19. `FullProject.use` is non-optional and typed `UseOptions<PlaywrightTestOptions & TestArgs, …>`
    (`playwright/types/test.d.ts:769`), so `config.projects[0]?.use.baseURL` typechecks as
    `string | undefined`. ✅
20. `dotenv@17.4.2` supports `quiet?: boolean` (`lib/main.d.ts:53`), and `scripts/dev-voice.ts:2-3`
    uses the named-import style the design mirrors. ✅
21. `next dev` documents `-p` / `--port <port>` (default 3000, env `PORT`) at
    `next/dist/docs/01-app/03-api-reference/06-cli/next.md:70`; Turbopack is the default bundler. ✅
22. The standalone server template reads `const currentPort = parseInt(process.env.PORT, 10) || 3000`
    with `hostname = process.env.HOSTNAME || '0.0.0.0'` (`next/dist/build/utils.js:1204-1205`), and
    `package.json`'s `start` is a bare `node .next/standalone/server.js` — so the pwsh fallback must
    set `$env:PORT`, as documented. ✅
23. `pnpm` forwards unknown args to the script: `pnpm lint --version` runs `eslint "--version"`.
    `pnpm dev --port 3100` therefore reaches `next dev --port 3100` with no shell operators (NFR6). ✅
24. `tsconfig.json` `include` covers `**/*.ts`; `lib` is `["dom","dom.iterable","esnext"]` and
    TypeScript 5.9.3's `lib.dom.d.ts:2793` declares `timeout(milliseconds: number): AbortSignal`, so
    `AbortSignal.timeout` typechecks with no tsconfig change (AC13). `@types/node@^20` supplies
    `__dirname`. ✅
25. `vitest.config.ts` currently sets `exclude: ['**/node_modules/**', '**/.claude/worktrees/**']`;
    adding `'**/e2e/**'` can only remove collected files, and no `e2e/` directory exists today, so
    AC4's before/after file-list comparison is safe. ✅
26. `sonner@2.0.7` emits `data-sonner-toast=""` (`dist/index.mjs:648`) and `data-type={toastType}`
    (`:662`). ✅
27. `.gitignore` already contains `.env*` with `!.env.example`, so a copied `.env.local` cannot be
    committed (AC12). ✅
28. `package.json` has no `packageManager` field, which is why `pnpm/action-setup@v4` needs an
    explicit `version:`; local pnpm is 10.8.1, lockfile is `lockfileVersion: '9.0'`. ✅
29. `engines: {node: '>=22.0.0'}` is declared across `@supabase/auth-js`, `functions-js`,
    `postgrest-js`, `realtime-js`, `storage-js`, `supabase-js` — all 2.112.2 — at
    `pnpm-lock.yaml:1975-2006`; local Node is v24.16.0; `@types/node` is pinned `^20`. The CI
    `node-version: 24` choice and the report-only observation are both accurate. ✅
30. `.github/workflows/migrations.yml` is the house style the design claims: leading secrets comment
    block, top-level `name`, `permissions: contents: read`, `concurrency` with
    `cancel-in-progress`, pinned action majors, `name:` on every step. The design's workflow matches,
    and `on: workflow_dispatch` alone produces no commit status, so it cannot gate merges
    (FR8.2). ✅
31. `eslint.config.mjs` is `eslint-config-next/core-web-vitals` + `/typescript` only — no `no-console`
    rule, so `global-setup.ts`'s logging will not add lint errors (AC14). ✅

**Requirements coverage** — FR1 (all six), FR2, FR3 (both layers), FR4.1–4.4, FR4.6 (moot, with
evidence), FR5, FR6, FR7, FR8 and NFR1–NFR7 are each addressed somewhere in the design. The test
count is internally consistent: 2 + 1 + 2 + 2 = 7 tests, 4 unconditional, 3 gated; Run A expects
4 passed / 3 skipped and Run B 5 passed / 2 skipped, which follows from the gates as written.

## Unverified / Wrong Assumptions

1. **`notFound()` returns HTTP 404 under Next 16.4 dev + Turbopack** — not executed, and not
   executable here (no `node_modules` in the worktree, so the app cannot be booted). The design
   already flags this and states the contingency (heading assertion is primary; drop the status line
   and report a 200 as an application observation). Left as-is deliberately — no finding.
2. **The Vitest baseline** — AC4 asserts 10 failures across 4 files; `AGENTS.md` records 3 failing
   files. Neither could be measured (`pnpm install` has not been run in the worktree). The design's
   step 2 re-measures before any change and uses that as the comparison basis, which is the right
   call; the discrepancy stays open until that step runs.
3. **Timing figures are derived, not measured** — the ~7 s / ~14 s backoff numbers follow correctly
   from verified library constants, but the 60 s navigation and 90 s test budgets have not been
   exercised against a cold Turbopack compile of `/smb/[slug]` on this machine. The design says so
   explicitly. The acceptance run is the proof.
4. **Outbound network for `next/font/google`** — `app/layout.tsx` imports `Geist` and `Geist_Mono`
   from `next/font/google`, so the first dev compile needs network even though the four
   "unconditional" tests need no Supabase project. The design discloses this in the README
   troubleshooting list, but the Overview's "the suite's green state is identical on a bare machine"
   is true only with network available. Disclosed, so no finding — worth keeping in the final report.
5. **`e2eEnv` getters are read in worker processes after `playwright.config.ts`'s dotenv load** — the
   design relies on Playwright loading the config in each worker. I did not trace the worker bootstrap
   to confirm it, and the getter change makes the ordering question moot in the main process only.
   Not a finding: if a worker somehow did not load the config, the effect is a skip, never a false
   pass.
6. **Library internals were verified against `e:\Projects\frontdesk-ai\node_modules`**, not the
   worktree's (which has none). Versions match the worktree's committed lockfile, and
   `@playwright/test`/`@supabase/ssr`/`@supabase/supabase-js` are `latest` specifiers resolved by
   that lockfile, so `pnpm install --frozen-lockfile` in the worktree will produce the same versions.
   Worth re-confirming after install if any cited line number matters.
