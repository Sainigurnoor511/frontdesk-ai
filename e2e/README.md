# E2E suite (Playwright)

Browser-level tests for the routes that do not need a logged-in session, plus one authenticated
journey that is skipped unless you supply a test account. Seven tests in four spec files: **four
run unconditionally** (no Supabase project, no seed data), **three are env-gated** and skip with a
message naming the variables they need. A bare checkout is green.

The suite is deliberately separate from Vitest — see [Adding a spec](#adding-a-spec).

## One-time setup

```powershell
pnpm install
pnpm exec playwright install chromium
```

## Running

```powershell
pnpm test:e2e                                  # headless, all specs
pnpm test:e2e:ui                               # interactive UI mode
pnpm exec playwright test e2e/login.e2e.ts     # one spec
pnpm exec playwright test --trace on           # force a trace for every test
pnpm exec playwright show-report               # open the last HTML report
```

Playwright boots the dev server itself (`pnpm dev --port 3100 --hostname 127.0.0.1`) and warms
`/login`, `/`, and the 404 booking route in `globalSetup`, so there is nothing to start by hand.

**`--hostname` is load-bearing, not tidiness.** Next 16 dev blocks cross-origin requests to
`/_next/*` dev resources, and the default allowlist is `['**.localhost', 'localhost', <the
hostname the server was bound to>]`
(`next/dist/server/lib/router-utils/block-cross-site-dev.js`). Served on the default hostname and
browsed as `127.0.0.1`, every chunk request comes back **403**, the page never hydrates, and every
test that needs client JS fails for a reason that looks nothing like its cause — the login
validation test sees a native GET form submit, and the booking 404 body never leaves the RSC flight
payload. Binding the dev server to the host the suite browses puts it on the allowlist without
touching `next.config.ts`. If you ever point the suite at a hand-started server, start it the same
way, or add the host to `allowedDevOrigins`.

Artifacts land in `test-results/` (traces, failure screenshots) and `playwright-report/` (HTML).
Both are gitignored, along with `.playwright/`.

## Environment variables

**Every variable below follows one rule: blank means absent.** A value of `''` or whitespace is
treated exactly as if it were unset — there are no `??` fallbacks anywhere in the harness. That
matters because GitHub Actions binds `env: FOO: ${{ secrets.MISSING }}` to the empty string rather
than leaving it unset, and because `@next/env` treats a blank inherited value as "present" and so
stops applying the real value from `.env.local`.

| Variable | Required | Consumer | Behaviour when absent or blank |
| --- | --- | --- | --- |
| `E2E_BASE_URL` | optional | config, globalSetup | defaults to `http://127.0.0.1:${E2E_PORT}`. Validated as an absolute URL at config load. **When set, the local dev server and the warm-up are both disabled** — it means "test this other origin, boot nothing" |
| `E2E_PORT` | optional | config | defaults to `3100`; must be an integer 1–65535 or the config throws immediately, naming the value. Ignored when `E2E_BASE_URL` is set (no server is booted); still validated, so a malformed value throws either way |
| `E2E_NO_WEB_SERVER` | optional | config | the app is booted. Set it to mean "a server is already listening on `E2E_PORT`, don't start a second one" — that is its only purpose. The warm-up still runs, because a hand-started `pnpm dev` has cold routes |
| `NEXT_PUBLIC_SUPABASE_URL` | optional | `webServer.env`, gates | a placeholder is injected into the dev server only; Supabase-dependent tests skip |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | optional | `webServer.env`, gates | same |
| `SUPABASE_SECRET_KEY` | optional | `webServer.env`, gates | same |
| `E2E_BOOKING_SLUG` | optional | booking spec | the live-slug test skips |
| `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` | optional | auth-live spec | the authenticated journey skips |

`playwright.config.ts` loads `.env.local` from the repo root with dotenv (missing file: silent),
so copying `.env.local` from the main checkout is all it takes to light up the gated tests.
dotenv never overwrites an existing `process.env` entry, so a shell or CI value still wins.
`.env*` is already gitignored, so a copied file cannot be committed.

**Gates follow the runner's environment, not the target app's.** When you point the suite at a
remote origin with `E2E_BASE_URL`, set the gating variables locally too, or the Supabase-dependent
tests will skip even though that origin could serve them.

No value is ever printed. Skip messages name variables, never contents.

## Which tests skip, and what they need

| Test | Gated on |
| --- | --- |
| `booking-page.e2e.ts` → public booking page loads for a configured slug | `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` **and** `E2E_BOOKING_SLUG`. The slug is resolved with the service-role client (`getOrganizationBySlug` → `createServiceRoleClient`), so both Supabase variables are co-preconditions; with only the slug set the lookup returns `null` and the route 404s. The organization must have `organization_settings.booking_page_enabled = true` |
| `auth-live.e2e.ts` → shows a visible error toast when sign-in is rejected | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, reachable |
| `auth-live.e2e.ts` → signs in and reaches the app shell | the same two Supabase variables **plus** `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` for a user that owns an organization. There is no TOTP prerequisite: TOTP in this app is enrolment-only and the dashboard layout performs no assurance-level check |

The four unconditional tests are `login.e2e.ts` (×2), `auth-redirect.e2e.ts`, and the unknown-slug
404 in `booking-page.e2e.ts`.

## Adding a spec

Name it `e2e/<area>.e2e.ts`. **Never `*.test.ts`** — that is the Vitest naming convention and the
two runners must not collide (`@playwright/test`'s globals explode under Vitest).

Isolation is two layers on purpose, and both should stay:

1. **Naming.** `playwright.config.ts` sets `testMatch: '**/*.e2e.ts'`. Vitest's default include
   (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) cannot match `.e2e.ts`, and replacing Playwright's default
   `testMatch` keeps Playwright out of the co-located `*.test.ts` files under `app/` and `lib/`.
   It is also what keeps `e2e/support/*.ts` uncollected.
2. **Exclude.** `vitest.config.ts` excludes `**/e2e/**`, so a future `e2e/foo.test.ts` — the
   obvious mistake — stays invisible to Vitest.

Prefer role/label/text locators. Use `exact: true` on "Sign in" and "Password": Playwright's
role-name and label matching is case-insensitive *substring* by default, so "Sign in" also matches
the Google button's "Sign in with Google" and "Password" also matches the show/hide toggle's
`aria-label="Show password"`.

Anything that needs a real Supabase project goes behind a getter in `e2e/support/env.ts` and a
`test.skip()` whose message names the variables and the data prerequisite. A test that fails for
want of seed data is a broken test.

## Deviations from the requirements

Three, all deliberate:

- **Base URL (FR1.3).** The requirement specifies a `http://localhost:3000` default; the harness
  uses `http://127.0.0.1:3100`. Several agents run dev servers across worktrees on this machine and
  `reuseExistingServer` would happily attach to another branch's server on 3000 and produce
  nonsense; `127.0.0.1` also avoids the IPv6-first resolution stall on Windows. Restore the
  original with `E2E_PORT=3000` plus `E2E_BASE_URL=http://localhost:3000`.
- **Two attribute locators (FR4.5).** Locators are role/label/text based with two exceptions, both
  structural attributes rather than styling hooks: `[data-booking-public-root]` on the booking page
  (every visible string there is switchable through `booking_page_config`) and
  `[data-sonner-toast][data-type="error"]` for the toast (sonner exposes no role or accessible name
  for the error variant).
- **Form-driven sign-in (FR5.1).** The requirement prefers a programmatic Supabase session injected
  as `storageState`. The authenticated journey drives the login form instead: injecting a session
  means reproducing `@supabase/ssr`'s cookie format (`sb-<project-ref>-auth-token`, base64-chunked
  across numbered cookies), which is library internals with no public writer API, so a patch bump
  would break the harness in a way that looks like an app bug. Driving the form costs one extra
  round-trip in a test that is skipped by default and additionally covers the `logIn` server
  action's redirect. Revisit at roughly three authenticated tests, where a `storageState` setup
  project would amortise a single sign-in across them.

## Dev server, not a production build

The specs assert routing, redirects, server-component rendering, and client-side form validation —
none of which differ in a production build — and `pnpm build` costs minutes per run plus a
dependency on the `postbuild` standalone copy step. Dev mode keeps the loop short; the cold-compile
cost is moved into `globalSetup`.

If dev-mode latency ever proves unreliable, there is exactly one production fallback. It must set
`PORT`, because the generated standalone entry point reads the port at runtime and `pnpm start` is
a bare `node .next/standalone/server.js`:

```powershell
# terminal 1 — serve the production build on the harness's port
# (no --hostname concern here: the dev-resource block is dev-only)
$env:PORT = '3100'; pnpm build; pnpm start

# terminal 2 — run the suite against it, booting nothing
$env:E2E_NO_WEB_SERVER = '1'; pnpm test:e2e
```

## CI

`.github/workflows/e2e.yml` is `workflow_dispatch`-only and has **never been executed** — GitHub
Actions cannot run locally. With no `push` or `pull_request` trigger it produces no commit status,
so no branch-protection rule can require it; that is deliberate while the suite is new. All six
secrets it reads are optional: with none set, the four unconditional tests run green and the other
three skip.

## Troubleshooting

- **The unknown-slug 404 test passes even with no database.** `getOrganizationBySlug` destructures
  only `data` and ignores `error`, so an unreachable project and a genuinely missing org both
  produce `null` → `notFound()`. The test proves routing, not data.
- **`/smb/<slug>` feels hung.** With an unreachable database, `@supabase/postgrest-js` retries a
  network error three times with 1s/2s/4s backoff — about 7s per `getOrganizationBySlug` call — and
  `app/smb/[slug]/page.tsx` calls it twice per render (`generateMetadata` and the page component,
  no `React.cache()`). ~14s is expected, which is why `navigationTimeout` is 60s.
- **The first dev compile needs outbound network.** `app/layout.tsx` imports `Geist` and
  `Geist_Mono` from `next/font/google`; a failed font fetch errors the route. The suite needs no
  Supabase project, but it does need internet on a cold `.next`.
- **A 500 on every route** usually means a blank Supabase value somewhere the harness could not
  see. Copy `.env.local` from the main checkout, or check for a key present but empty.
- **`Blocked cross-origin request to Next.js dev resource` in the `[WebServer]` output, and tests
  behaving as if there were no JavaScript** means the dev server and the browsed host disagree. See
  the `--hostname` note under [Running](#running); an HMR-only instance of that warning is harmless.
- **Before an acceptance run, make sure the port is free.** `reuseExistingServer` is `true`
  locally, and Playwright checks the port before it ever considers the command, so a leftover
  `next dev` on 3100 gets attached to silently — with whatever environment *it* was started with,
  not the one you just configured. A run that did not start its own server proves nothing about
  your env changes:

  ```powershell
  if (Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 3100 is already in use - stop it or set $env:E2E_PORT before running the suite'
  }
  pnpm test:e2e
  ```

## Future load testing

Out of scope for this run; no load tooling ships here. The two interesting targets when it is
picked up:

- **The voice path** — `startPublicCall` through to the LiveKit room join, and the AssemblyAI relay
  server actions. Concurrency against a finite worker pool is the thing to measure.
- **The booking endpoints** — `app/smb/actions.ts`'s `createPublicAppointment` plus the
  availability engine, which fans out across business hours, staff overrides, exceptions, time off,
  and existing appointments per request.
