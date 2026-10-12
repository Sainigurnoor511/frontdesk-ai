# Design — E2E test harness (Playwright)

> Revision 3. Addresses all 10 findings from the revision-2 review (`03-design-review.md` /
> `design-review.json`: 0 HIGH, 4 MEDIUM, 6 NIT). Responses are itemised at the end. The 18
> findings from the revision-1 review were addressed in revision 2 and those resolutions are
> retained in the body below.

## Overview

The harness is a self-contained Playwright installation that lives entirely outside the application:
a `playwright.config.ts` at the worktree root, a top-level `e2e/` directory holding spec files named
`*.e2e.ts` plus two non-collected support modules, two `package.json` scripts, three `.gitignore`
entries, a one-line `vitest.config.ts` exclude, a `workflow_dispatch`-only CI workflow, and
`e2e/README.md`. Playwright boots the Next dev server itself on a dedicated port (3100) via
`webServer`, then warms the three routes under test in `globalSetup`, so `pnpm test:e2e` is a single
command with no manual setup beyond `pnpm install` and `pnpm exec playwright install chromium`.

**Four spec files ship, seven tests: four unconditional, three env-gated.** The four unconditional
tests need no seeded data and no reachable Supabase project — `/login` renders, submitting with an
empty password shows the inline client-side validation error, an unauthenticated hit on `/` lands on
`/login`, and an unknown booking slug renders the 404 body with a 404 status. The three gated tests
`test.skip` with a named-variable message when their variables are absent: the sign-in error toast
(needs a reachable Supabase project), the booking page for a live slug (needs `E2E_BOOKING_SLUG`),
and the single authenticated journey (needs `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`). Nothing fails
for want of seed data; the suite's green state is identical on a bare machine and on a fully
configured one, with more tests running in the latter.

Throughout this document, **"test"** means a `test()` block and **"spec file"** means a file.

The one piece of real risk in this task is the Vitest/Playwright collision, because Vitest's default
include glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) would otherwise collect Playwright specs and
explode on `@playwright/test`'s globals. That is closed at two layers, described below.

## Technology stack (locked)

- `@playwright/test` 1.62.1 — already in `devDependencies` as `latest`, pinned to 1.62.1 by
  `pnpm-lock.yaml`. No new dependency is added.
- Chromium only, via `pnpm exec playwright install chromium`.
- `dotenv` 17 (already in `devDependencies`, used by `scripts/dev-voice.ts`) to load `.env.local`
  inside `playwright.config.ts`, imported in the same named-import style that file uses.
- TypeScript, strict, under the existing root `tsconfig.json` (its `include` already covers
  `**/*.ts`, so specs and the config are typechecked by `pnpm exec tsc --noEmit` with no tsconfig
  change).
- **Node 22+.** The local runtime measured on this machine is **v24.16.0**, and the installed
  Supabase family (`@supabase/supabase-js`, `auth-js`, `postgrest-js`, `realtime-js`, `storage-js`,
  `functions-js` — all 2.112.2) declares `engines: {node: '>=22.0.0'}` in `pnpm-lock.yaml`
  (lines 1978–2006); `ai@7` and the `@ai-sdk/*` packages declare `node >= 22` as well. There is no
  `.npmrc`, so `engine-strict` is off and `pnpm install` only warns — but CI must not be pinned
  below the floor its own dependency tree declares. `@types/node` is pinned at `^20` repo-wide;
  that is a pre-existing devDependency, not evidence of the runtime, and this run does not touch it.
- pnpm 10 (local `pnpm --version` is 10.8.1; `pnpm-lock.yaml` is `lockfileVersion: '9.0'`).
  GitHub Actions for the optional workflow, on Node 24 to match the dev machine.

No new runtime dependency, no `playwright/tsconfig.json`, no custom test runner wrapper, no
fixture/page-object layer — seven tests do not justify one.

## Runner isolation

Two layers, both explicit, as FR3 requires.

**Layer 1 — naming (Playwright side).** Spec files are named `*.e2e.ts`, and `playwright.config.ts`
sets `testMatch: '**/*.e2e.ts'`. Vitest's default include cannot match `.e2e.ts`, so even with no
Vitest change the collision is gone; and because Playwright's own default `testMatch`
(`**/*.@(spec|test).?(c|m)[jt]s?(x)`) is replaced, Playwright cannot wander into a co-located
`*.test.ts` even if `testDir` were ever widened. The same rule is what keeps `e2e/support/*.ts`
uncollected.

**Layer 2 — exclude (Vitest side).** `vitest.config.ts` gains `'**/e2e/**'` to its existing
`exclude` array. This is belt-and-braces: it guarantees that a future `e2e/foo.test.ts` (the obvious
mistake) stays invisible to Vitest, and it keeps Vitest from even scanning the directory.

The alternative — relying on naming alone and leaving `vitest.config.ts` untouched — was considered
because the file sits outside the brief's stated ownership set. It is rejected: the requirements
explicitly permit an `exclude` addition (AC15), no other parallel run is expected to touch
`vitest.config.ts`, and a one-line array addition is about the lowest-conflict diff possible. The
layered version survives a future contributor who names a spec `e2e/login.test.ts`; naming alone does
not. Adding an exclude can only remove collected files, never add them, so AC4's before/after file
list comparison stays safe.

Enforcement ownership: Playwright's collection boundary is owned by `playwright.config.ts`
(`testDir` + `testMatch`); Vitest's is owned by `vitest.config.ts` (`exclude`). Neither depends on
the other being correct. Verification is mechanical and part of the acceptance run:
`pnpm exec playwright test --list` must show only `e2e/*.e2e.ts` files, and the Vitest file list
before and after the change must be identical.

## The one env rule: blank means absent

Every environment variable this harness reads goes through **one** reader, and the rule is that an
empty or whitespace-only value is treated exactly like an unset one. There are no `??` exceptions
anywhere in the harness, because `??` substitutes only for `undefined`/`null` and the two
environments that matter most both hand over empty strings:

- **GitHub Actions.** `env: FOO: ${{ secrets.MISSING }}` does not leave `FOO` unset; it sets it to
  `''`. A dispatch with no secrets configured would therefore pass `NEXT_PUBLIC_SUPABASE_URL=''`
  straight through a `??` fallback.
- **A copied `.env.local`** with a key present but blank does the same thing locally.

The consequence of getting this wrong is not a skip, it is a 500 on every route under test.
`proxy.ts` calls `updateSession` on a matcher that covers `/`, `/login` and `/smb/*`, and
`lib/supabase/middleware.ts:7-9` passes `process.env.NEXT_PUBLIC_SUPABASE_URL!` /
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!` into `createServerClient`, whose first statement is a
**falsy** check — `@supabase/ssr@0.12.4/dist/main/createServerClient.js:11-13`:
`if (!supabaseUrl || !supabaseKey) throw new Error("Your project's URL and Key are required…")`.
`''` throws exactly like `undefined`, so all four "unconditional" tests would fail.

There is a second reason never to let `''` reach the child process, which is specific to Next's env
loader. `@next/env@16.4.0` snapshots `process.env` as `initialEnv` on first `loadEnvConfig`, and
`processEnv` only applies a `.env.local` key when `typeof initialEnv[key] === 'undefined'`. An empty
string is a `'string'`, so a blank inherited value **also suppresses the real value in
`.env.local`** inside the dev server. Passing a placeholder instead of `''` avoids both failure
modes at once, and because Playwright merges the child env as
`{...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...options.env}`
(`playwright@1.62.1/lib/runner/index.js:858-862`, re-verified), a value in `webServer.env` wins last
and then survives `@next/env` untouched.

The reader lives in `e2e/support/env.ts` and is imported by both `playwright.config.ts` and the
specs, so the rule has exactly one implementation.

## `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import { readEnv } from './e2e/support/env'

// Loads the worktree's .env.local when one is present, so the dev server and
// the env-gated specs see the same values. dotenv never overwrites an existing
// process.env entry, so a shell/CI value still wins. Missing file: silent.
loadEnv({ path: path.resolve(__dirname, '.env.local'), quiet: true })

// Validated at config load: an unparseable port otherwise becomes
// `http://127.0.0.1:NaN`, which is a *valid* URL, so Playwright would launch
// `pnpm dev --port NaN` and poll it for the full webServer timeout.
const rawPort = readEnv('E2E_PORT') ?? '3100'
const port = Number(rawPort)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`E2E_PORT must be an integer between 1 and 65535, got "${rawPort}"`)
}

// Validated for the same reason: a scheme-less value ("localhost:3000") is
// accepted by `use.baseURL` and only surfaces much later as a confusing
// navigation error in whichever spec happens to run first.
const explicitBaseURL = readEnv('E2E_BASE_URL')
if (explicitBaseURL) {
  try {
    new URL(explicitBaseURL)
  } catch {
    throw new Error(`E2E_BASE_URL must be an absolute URL, got "${explicitBaseURL}"`)
  }
}

// 127.0.0.1, not localhost: avoids the IPv6-first resolution stall on Windows.
const serverUrl = `http://127.0.0.1:${port}`
const baseURL = explicitBaseURL ?? serverUrl
// Pointing the suite at a foreign origin means we must NOT boot a local server:
// Playwright would otherwise start `next dev` here and then poll the foreign
// origin for readiness. E2E_NO_WEB_SERVER covers the other case — a server is
// already listening on E2E_PORT. One flag, one meaning, for each.
const useWebServer = !readEnv('E2E_NO_WEB_SERVER') && !explicitBaseURL

/**
 * The app crashes at request time if the Supabase client factories get a falsy
 * URL/key (@supabase/ssr throws "Your project's URL and Key are required..."),
 * and `proxy.ts` builds a server client on nearly every request, so the
 * baseline specs need these vars *present and non-blank* — not valid. An
 * unreachable project is fine: `auth.getUser()` with no session cookie resolves
 * to `{ user: null }` without a network call, which is exactly the "no session"
 * path the redirect spec asserts, and a failed PostgREST query resolves to
 * `{ data: null }`, which is the `notFound()` path the 404 spec asserts.
 *
 * `readEnv` (not `??`) is what makes this hold when CI binds these names to
 * missing secrets and hands over empty strings — see "The one env rule" above.
 *
 * Port 1 is deliberate: it can never collide with a real local Supabase
 * (54321), so a placeholder can never be mistaken for a configured project.
 * These values go only into the child process below — never into this process —
 * which is why e2e/support/env.ts gates on presence alone.
 */
function envOrPlaceholder(name: string, placeholder: string): string {
  return readEnv(name) ?? placeholder
}

const placeholderSupabaseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: envOrPlaceholder('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:1'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: envOrPlaceholder(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'e2e-placeholder-publishable-key'
  ),
  SUPABASE_SECRET_KEY: envOrPlaceholder('SUPABASE_SECRET_KEY', 'e2e-placeholder-secret-key'),
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/support/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One dev server serves every worker; two keeps compile contention sane.
  workers: process.env.CI ? 1 : 2,
  // `list` for readable terminal output in both places; `html` for the report
  // the CI workflow uploads as an artifact. Never auto-open — it would hang a
  // non-interactive run.
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL,
    // Locally there are no retries, so `on-first-retry` would never fire and
    // the failing run's trace would be lost. `retain-on-failure` keeps traces
    // for failed tests only, so a green run costs nothing.
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    // 60s, not 30s: see "Timing budget" below — /smb/[slug] pays a postgrest
    // retry backoff twice per navigation when the database is unreachable.
    navigationTimeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: useWebServer
    ? {
        command: `pnpm dev --port ${port}`,
        url: serverUrl,
        reuseExistingServer: !process.env.CI,
        // Cold Next 16 dev start + first route compile on Windows.
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: placeholderSupabaseEnv,
      }
    : undefined,
})
```

Decisions worth naming:

**Dev server, not production build.** `webServer.command` is `pnpm dev --port ${port}`. The specs
assert routing, redirects, server-component rendering, and client-side form validation — none of
which differ in a production build — and `pnpm build` on this app (Turbopack, `output: "standalone"`,
plus the `postbuild` standalone copy step) costs minutes per run and would also mean `pnpm start`
serves from `.next/standalone`, making the harness depend on the postbuild script. Dev mode keeps the
feedback loop short. The cost is first-navigation compile latency, handled by `globalSetup` warming
plus the timeouts below. `next dev` documents `-p/--port` (default 3000, env `PORT`) in
`node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`, and the flag needs no shell
operators, so it runs as-is under pwsh (NFR6).

If dev-mode latency ever proves unreliable, there is exactly **one** documented production fallback,
and it sets `PORT` because it has to. The generated standalone entry point reads the port at runtime
— `const currentPort = parseInt(process.env.PORT, 10) || 3000` in the server.js template at
`next/dist/build/utils.js:1204`, with `hostname = process.env.HOSTNAME || '0.0.0.0'` — and
`package.json`'s `start` script is a bare `node .next/standalone/server.js`, so without `PORT` the
build would listen on 3000 while the suite polled 3100. In pwsh, verbatim:

```powershell
# terminal 1 — serve the production build on the harness's port
$env:PORT = '3100'; pnpm build; pnpm start

# terminal 2 — run the suite against it, booting nothing
$env:E2E_NO_WEB_SERVER = '1'; pnpm test:e2e
```

The `E2E_BASE_URL` variant (`pnpm start` on 3000, then
`$env:E2E_BASE_URL = 'http://127.0.0.1:3000'`) also works and also disables `webServer`, but it is
deliberately **not** documented as the production fallback: that would give two ways to do one thing.
`E2E_BASE_URL` keeps a single distinct meaning — "test this other origin" — and
`E2E_NO_WEB_SERVER` keeps the other — "something is already listening on `E2E_PORT`, don't start a
second one". The env table states both meanings in exactly those words.

**Port 3100, not 3000.** Several agents run dev servers across worktrees on this machine, and
`reuseExistingServer: true` would happily attach to a *different branch's* server on 3000 and produce
nonsense results. A dedicated port makes accidental reuse improbable; `E2E_PORT` overrides it. **This
deviates from FR1.3's stated default of `http://localhost:3000`**; `E2E_PORT=3000` plus
`E2E_BASE_URL=http://localhost:3000` restore it for anyone who wants it. The deviation is repeated in
`e2e/README.md` and in the final report.

**`E2E_BASE_URL` implies no local server.** The two settings are decoupled (`serverUrl` for the
readiness poll and the `--port` flag, `baseURL` for the specs) and `useWebServer` is false whenever
`E2E_BASE_URL` is set. The harness never boots a server it is not going to test.

**Placeholder Supabase env.** Injecting placeholders only for vars still blank/unset *after* dotenv
has loaded `.env.local` means a real `.env.local` is never shadowed, and the merge order
(`...process.env, ...options.env`) means `PATH` survives while our three keys win last. The effect:
the four unconditional tests pass on a worktree with **no `.env.local` and no reachable Supabase
project**. Outbound network is still required on the first dev compile, because `app/layout.tsx`
imports `Geist` and `Geist_Mono` from `next/font/google` and a failed font fetch errors the route;
this qualification is also in the README's troubleshooting list.

## Timing budget

This is the one place where the unconditional specs could go yellow, so the numbers are derived
rather than guessed.

`/smb/[slug]` is the expensive route. With an unreachable database, `getOrganizationBySlug`'s GET is
retried by `@supabase/postgrest-js@2.112.2` on a network error before the builder's `res.catch(...)`
converts it to `{ data: null }`: `DEFAULT_MAX_RETRIES = 3`, `retryEnabled` defaults to `true`, and
`getRetryDelay = Math.min(1000 * 2 ** i, 30000)`, so **1 s + 2 s + 4 s = 7 s of backoff** per call
(verified in the installed `dist/index.cjs`, lines 7/15/225/373). And `app/smb/[slug]/page.tsx` calls
`getOrganizationBySlug` **twice** — once in `generateMetadata`, once in the page component — with no
`React.cache()` wrapper, so the worst case is **~14 s** of pure backoff on top of a cold Turbopack
compile of a route that pulls in settings, services, agents, availability-engine, booking-config, and
JSON-LD modules.

Three mitigations, in order of effect:

1. **`globalSetup` warms the routes.** Playwright's task order is
   `removeOutputDirs → plugin setup (which is where webServer lives) → globalTeardowns → globalSetups`
   (verified at `playwright/lib/runner/index.js:6003`), so the dev server is already up when
   `globalSetup` runs. It issues one plain `fetch` per route under test, which moves every cold
   compile out of the tests and into a phase with no per-test timeout.
2. **`navigationTimeout: 60_000`** (up from 30 s), which covers the ~14 s backoff that warming cannot
   remove — the backoff is paid on every navigation, not just the first.
3. **`timeout: 90_000`** per test, leaving headroom above the navigation budget for the assertions.

A per-`goto` `{ timeout: 60_000 }` override was considered and omitted: with `navigationTimeout` at
60 s it is a no-op, and a redundant literal in the spec would drift from the config. The README
records the 7 s-per-call backoff next to the "also passes when the database is unreachable" note so
the latency is never mistaken for a hang.

These figures are derived from verified library constants, not measured. The acceptance run (below)
is what proves the budget is adequate on this machine; if a route exceeds it, the warm-up log lines
name which one.

## Support modules

Neither file matches `*.e2e.ts`, so Playwright does not collect them; `vitest.config.ts`'s `e2e/**`
exclude keeps Vitest out too. `env.ts` is additionally imported by `playwright.config.ts`, which is
safe because it imports nothing from `@playwright/test`.

### `e2e/support/env.ts`

Single source of truth for the blank-means-absent rule and for every gate.

```ts
/**
 * Reads an environment variable, treating blank (empty or whitespace-only) as
 * absent. This is the harness's only env reader — `playwright.config.ts` uses
 * it too — because `??` alone would let CI's empty-string secrets through and
 * crash the dev server (@supabase/ssr falsy-checks its URL and key).
 */
export function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() ? value : undefined
}

/**
 * The gates. Getters, not fields, so the values are read when a test asks
 * rather than at import time — nothing then depends on whether the config's
 * dotenv load happened before this module was first imported in a worker.
 *
 * No defaults, no secrets logged — skip messages name variables, never values.
 */
export const e2eEnv = {
  get bookingSlug(): string | null {
    return readEnv('E2E_BOOKING_SLUG')?.trim() ?? null
  },
  get userEmail(): string | null {
    return readEnv('E2E_USER_EMAIL')?.trim() ?? null
  },
  /**
   * Not trimmed: leading/trailing whitespace can be part of a password. A
   * whitespace-only value is still treated as absent, which is the right
   * trade — an all-spaces password is far likelier to be a stray env line.
   */
  get userPassword(): string | null {
    return readEnv('E2E_USER_PASSWORD') ?? null
  },
  /**
   * True when .env.local (or the shell) supplied a real project. The config's
   * placeholders go only into `webServer.env`, never into this process, so
   * presence here is sufficient — there is nothing to distinguish from.
   *
   * Note this reads the *runner's* environment, not the target app's: see the
   * README's env table for what that means when testing a remote origin.
   */
  get supabaseConfigured(): boolean {
    return Boolean(
      readEnv('NEXT_PUBLIC_SUPABASE_URL') && readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    )
  },
}
```

### `e2e/support/global-setup.ts`

```ts
import type { FullConfig } from '@playwright/test'
import { readEnv } from './env'

/**
 * Warms the three routes the suite navigates to, so a cold Turbopack compile is
 * paid here rather than inside a test. Best-effort by design: a warm-up failure
 * is logged and ignored, because the specs' own assertions are the gate — if
 * the app is genuinely broken, the tests must be what says so.
 *
 * Runs after `webServer` (plugin setup precedes globalSetup in Playwright's
 * task list), so the server is already answering.
 */
const ROUTES = ['/login', '/', '/smb/e2e-nonexistent-org-do-not-create']

export default async function globalSetup(config: FullConfig) {
  // Same two flags, same two meanings as the config: if we did not start the
  // server, we do not presume to warm it.
  if (readEnv('E2E_NO_WEB_SERVER') || readEnv('E2E_BASE_URL')) return
  // FullProject.use is UseOptions<...>, so baseURL is `string | undefined`.
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) return

  for (const route of ROUTES) {
    const startedAt = Date.now()
    try {
      const res = await fetch(new URL(route, baseURL), {
        redirect: 'manual',
        signal: AbortSignal.timeout(120_000),
      })
      console.log(`[e2e warm-up] ${route} -> ${res.status} in ${Date.now() - startedAt}ms`)
    } catch (error) {
      console.warn(
        `[e2e warm-up] ${route} failed after ${Date.now() - startedAt}ms:`,
        error instanceof Error ? error.message : error
      )
    }
  }
}
```

`redirect: 'manual'` keeps the `/` warm-up from following the 307 to `/login` (already warmed) and
makes the logged status a useful signal in its own right. The per-fetch `AbortSignal.timeout` is the
only bound on this phase, which is why it is explicit: `globalSetup` has no implicit timeout.

Typing note: `tsconfig.json` has `lib: ["dom", "dom.iterable", "esnext"]`, so global `fetch`,
`AbortSignal.timeout`, and `console` are all typed with no extra import, and `@types/node` supplies
`__dirname` for the config file. Nothing here needs a tsconfig change (AC13).

## Env contract

Every row below obeys the blank-means-absent rule — a variable set to `''` or to whitespace behaves
exactly as if it were unset, with no exceptions.

| Variable | Required | Type / limits | Consumer | Behaviour when absent or blank |
| --- | --- | --- | --- | --- |
| `E2E_BASE_URL` | optional | absolute URL, **validated** with `new URL()` at config load; a scheme-less value throws | config, globalSetup | defaults to `http://127.0.0.1:${E2E_PORT}`. **When set, `webServer` and the warm-up are disabled** — meaning "test this other origin, boot nothing" |
| `E2E_PORT` | optional | integer 1–65535, validated at config load | config | defaults to `3100`; anything unparseable makes the config **throw immediately**, naming the offending value |
| `E2E_NO_WEB_SERVER` | optional | any non-blank string | config, globalSetup | `webServer` is configured and the app is booted. Set it to mean "a server is already listening on `E2E_PORT`" — that is its only purpose |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | optional | non-blank string | `webServer.env`, `e2eEnv.supabaseConfigured` | placeholders injected into the server only; Supabase-dependent tests skip |
| `E2E_BOOKING_SLUG` | optional | org slug, unvalidated (see below) | booking spec | test skips; message names the variable and the `booking_page_enabled` prerequisite |
| `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` | optional | string / string, unvalidated | live-auth spec | test skips; message names both variables and the account prerequisite |

Validation rules, stated per variable rather than in the aggregate:

- `E2E_PORT` and `E2E_BASE_URL` are the only two with **format** validation, and both throw at config
  load naming the offending value. They earn it because a malformed value in either fails *slowly and
  misleadingly* — `NaN` and `localhost:3000` are both accepted by the code downstream and surface
  minutes later as a readiness timeout or a navigation error in an arbitrary spec.
- `E2E_BOOKING_SLUG`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` are **deliberately unvalidated** beyond
  blankness. A malformed slug produces a 404 and the test fails with Playwright's own diff, which is
  already the clearest possible signal; pre-validating the shape would move the failure earlier
  without making it more informative.
- `E2E_USER_PASSWORD` is the only variable not trimmed before use, because whitespace may be
  significant in a password. Blankness is still checked.
- No value is ever printed. Skip messages name variables, never contents (NFR3).

## Specs

All locators are role/label/text based per FR4.5. Two exactness details were established by reading
the markup and both matter: `getByRole('button', { name: 'Sign in' })` substring-matches
`GoogleButton`'s "Sign in with Google" as well as the submit button (Playwright's `name` is a
case-insensitive substring match unless `exact: true`), and `getByLabel('Password')` matches the
show/hide toggle's `aria-label="Show password"`. Both therefore use `exact: true`.

### `e2e/login.e2e.ts` — 2 tests, both unconditional, zero network

```ts
import { test, expect } from '@playwright/test'

test.describe('login page', () => {
  test('renders the sign-in form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('shows a visible validation error for an incomplete submission', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill('e2e-nobody@example.com')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    // zodResolver(loginSchema): password.min(1, 'Password is required'), rendered
    // as <p class="text-sm text-destructive"> by components/auth/login-form.tsx.
    await expect(page.getByText('Password is required')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })
})
```

This file is deliberately network-free, which is what makes it the suite's floor: it passes with no
`.env.local`, no database, and no seed data.

The second test is the FR4.2 workhorse and uses the **empty-password** case rather than a malformed
email: the email input is `type="email"` on a form without `noValidate`, so Chromium's native
validation would block submission and react-hook-form's Zod error would never render. An empty
password passes native validation (react-hook-form with a resolver sets no `required` attribute),
reaches the resolver, and renders a real visible error with zero network traffic. The paired URL
assertion closes AC7's "not merely that navigation did not occur" loophole from the other side: the
visible element is the primary assertion, the URL is corroboration.

### `e2e/auth-redirect.e2e.ts` — 1 test, unconditional

```ts
import { test, expect } from '@playwright/test'

test('unauthenticated dashboard access redirects to /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login(\?.*)?$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})
```

`/` is an `app/(dashboard)` route; the layout calls `getCurrentOrgAndUser()` and `redirect('/login')`
when it returns null. Asserting the final URL *and* the login heading closes the loophole where a
redirect chain ends somewhere unexpected. This is deterministic even with placeholder Supabase env:
with no session cookie, GoTrue short-circuits `getUser()` without any network call, so the layout
takes the null-session branch on a fixed code path rather than on a timing-dependent failure.

### `e2e/booking-page.e2e.ts` — 2 tests, 1 gated

```ts
import { test, expect } from '@playwright/test'
import { e2eEnv } from './support/env'

test('unknown slug renders the booking 404', async ({ page }) => {
  const response = await page.goto('/smb/e2e-nonexistent-org-do-not-create')
  await expect(page.getByRole('heading', { name: 'Booking page not found' })).toBeVisible()
  expect(response?.status()).toBe(404)
})

test('public booking page loads for a configured slug', async ({ page }) => {
  test.skip(
    !e2eEnv.bookingSlug,
    'Set E2E_BOOKING_SLUG to an organization slug whose organization_settings.booking_page_enabled is true'
  )
  await page.goto(`/smb/${e2eEnv.bookingSlug}`)
  await expect(page.locator('[data-booking-public-root]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Booking page not found' })).toHaveCount(0)
})
```

The 404 test uses a fixed, obviously-absent slug (no clock, no randomness — NFR4) and is the only
unconditional coverage of the public route. The heading assertion comes **first** and the status
assertion second, deliberately: the rendered `not-found.tsx` body is the behaviour under test, and
the HTTP status is corroboration. Whether `notFound()` yields a 404 document status under Next 16.4
dev/Turbopack has not been executed here; it is consistent with Next's documented behaviour and with
`app/smb/[slug]/not-found.tsx` being the nearest boundary, but if the acceptance run shows a 200 the
status line is dropped and the discrepancy is reported as an application observation (NFR1) rather
than the spec being weakened in any other way.

The test is honest about what it proves: `notFound()` renders. It passes both when the org genuinely
does not exist and when the database is unreachable (`getOrganizationBySlug` destructures only `data`
and ignores `error`, so both produce `null`); `e2e/README.md` records that, together with the
retry-backoff latency, so nobody mistakes it for a data assertion.

The live-slug test asserts the `data-booking-public-root` attribute on `BookingPagePublicClient`'s
root element rather than any inner copy, because every visible string on that page — tagline, header,
tab bar, receptionist panel — is switchable through `booking_page_config`. The attribute sits outside
every config-dependent branch, so it is present for any enabled configuration. The paired
`toHaveCount(0)` on the 404 heading makes a silently-404ing slug fail loudly instead of passing on a
vacuous truth.

Turnstile needs no handling at all — see the application observation at the end — so FR4.6's
always-pass test keys are unused.

### `e2e/auth-live.e2e.ts` — 2 tests, both gated, serial

Every test that signs in against a real Supabase project lives in this one file, and the file runs
serially. That prevents the two of them from landing on Supabase auth concurrently (the default is
`fullyParallel: true` with two local workers) and rate-limiting each other — a self-inflicted
collision is not something to absorb with a tolerant assertion.

```ts
import { test, expect } from '@playwright/test'
import { e2eEnv } from './support/env'

// Serial: both tests hit Supabase auth on the same project. Running them in
// parallel invites a rate limit that has nothing to do with what is under test.
test.describe.configure({ mode: 'serial' })

test('shows a visible error toast when sign-in is rejected', async ({ page }) => {
  test.skip(
    !e2eEnv.supabaseConfigured,
    'Needs a reachable Supabase project: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (copy .env.local from the main checkout)'
  )
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('e2e-nobody@example.com')
  await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const toast = page.locator('[data-sonner-toast][data-type="error"]')
  await expect(toast).toBeVisible({ timeout: 20_000 })
  // What is asserted is exactly what the name says: a *visible error toast*.
  // friendlyAuthError() can emit any of these three, and the third is also what
  // an unreachable project produces — which is why the name does not promise
  // "wrong credentials were correctly identified". Serial mode is the
  // rate-limit mitigation; this regex is only a safety net.
  await expect(toast).toContainText(
    /Incorrect email or password|Too many attempts|Something went wrong/
  )
})

test('signs in and reaches the app shell', async ({ page }) => {
  test.skip(
    !e2eEnv.userEmail || !e2eEnv.userPassword,
    'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to a Supabase user that owns an organization'
  )
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(e2eEnv.userEmail!)
  await page.getByLabel('Password', { exact: true }).fill(e2eEnv.userPassword!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  // logIn() redirects to '/'; the dashboard layout then sends accounts with no
  // agent on to /onboarding. Both are a successful sign-in — and neither URL is
  // reachable without a session, which is what makes this the auth assertion.
  await expect(page).toHaveURL(/\/(onboarding)?$/, { timeout: 30_000 })
  // Exactly one <main> exists per route in this app (verified repo-wide):
  // SidebarInset on the dashboard, OnboardingShell on /onboarding. One
  // assertion covers both branches.
  await expect(page.getByRole('main')).toBeVisible()
})
```

The first test's name was chosen over "rejects wrong credentials with an error toast" on purpose. The
tolerant regex accepts "Something went wrong. Please try again.", which `friendlyAuthError`
(`app/(auth)/actions.ts:28-30`) emits for any unrecognised failure including an unreachable project,
so the stricter name would overstate the assertion. The alternative — keeping the strict name and
asserting `'Incorrect email or password'` exactly — was rejected because it converts a test that
merely needs *configured* env into one that needs a *reachable and responsive* project, which is a
flakiness source for no extra coverage of anything this harness owns.

Neither test is given a describe-level retry. FR5.2 and AC10 require the authenticated journey to be
deterministic or skipped, and a per-spec retry added to absorb a Supabase round-trip would make that
claim unverifiable. They run at the project setting — 0 locally, 2 on CI as a repo-wide policy. The
verification plan runs the suite twice; if the journey cannot pass twice at `retries: 0`, it converts
to a documented `test.skip` rather than re-acquiring retries.

**Deviation from FR5.1, stated deliberately.** The requirement prefers a programmatic Supabase
session injected as `storageState` over driving the login form. I choose to drive the form once,
inside the test. Injecting the session means reproducing `@supabase/ssr`'s cookie format —
`sb-<project-ref>-auth-token` with base64 chunking across numbered cookies — which is library
internals with no public writer API; a `@supabase/ssr` patch bump would silently break the harness in
a way that looks like an app bug. Driving the form is one extra round-trip in a test that is skipped
by default, costs nothing to maintain, and additionally covers the `logIn` server action's redirect.
A `storageState` setup project becomes worth the cost at roughly three authenticated tests — it would
amortise one sign-in across them. Keeping a single chromium project today also honours FR1.6
literally. **This deviation is carried into `e2e/README.md`'s "documented next step" paragraph and
into the final report**, alongside the FR1.3 port deviation, so neither disappears at hand-off.

## Error handling

| Operation | Failure condition | Recoverable? | What the caller sees | Logged |
| --- | --- | --- | --- | --- |
| `E2E_PORT` parse | not an integer in 1–65535 | fatal, immediate | config `throw` naming the variable and the offending value, before any browser or server starts | thrown error |
| `E2E_BASE_URL` parse | not an absolute URL (`new URL()` throws) | fatal, immediate | config `throw` naming the variable and the offending value | thrown error |
| `loadEnv()` on `.env.local` | file missing | yes, by design | silent (`quiet: true`); placeholders take over | no |
| any env var | set but blank | yes, by design | treated as unset: placeholder injected (Supabase keys) or test skipped (gates) | skip reason only |
| `webServer` boot | port busy with a *foreign* server answering | no — results would be wrong | `reuseExistingServer` attaches silently; mitigated by the dedicated port 3100 and the `E2E_PORT` escape hatch, both documented in the README | Playwright prints the reuse decision |
| `webServer` boot | `next dev` exits non-zero (bad env, syntax error) | fatal | Playwright aborts the run and prints the piped stdout/stderr (`stdout: 'pipe'`) | yes, by Playwright |
| `webServer` boot | server never answers within 180 s | fatal | Playwright's timeout error naming the URL | yes |
| `globalSetup` warm-up fetch | connection error, non-2xx, or 120 s abort | yes, ignored by design | nothing — the run proceeds and the specs assert for themselves | `console.warn` one line per route with route, elapsed ms, and message |
| spec navigation | 500 from a missing app env var | fatal for that test | assertion failure plus `screenshot: 'only-on-failure'` and a retained trace; README's first remedy is "copy `.env.local`" | Playwright report |
| spec navigation | slow cold compile beyond 60 s | fatal for that test | navigation timeout; the warm-up log lines show which route was slow | Playwright report + warm-up log |
| env gate | gating variable absent/blank | n/a, expected | `test.skip` with a message naming the variable and the data prerequisite; run stays green | skip reason in reporter output |
| Supabase auth round-trip (gated tests) | network error or rate limit | no retry by design | toast assertion fails and shows the actual toast text; serial mode removes the self-inflicted collision | Playwright report |
| booking slug lookup | DB unreachable | n/a | 404 test still passes (documented as routing-only coverage); live-slug test fails its `data-booking-public-root` assertion, which is correct — its precondition is a working project | Playwright report |

There is deliberately no `try`/`catch` inside any spec: Playwright's own failure reporting *is* the
error-handling mechanism, and swallowing a failure to keep a run green would defeat the harness. The
single `try`/`catch` in the codebase-facing direction is the warm-up, where ignoring the error is the
correct behaviour precisely because it asserts nothing.

## File changes

| File | Change |
| --- | --- |
| `playwright.config.ts` | new, as above |
| `e2e/support/env.ts` | new, `readEnv` + the gates (not collected) |
| `e2e/support/global-setup.ts` | new, route warm-up (not collected) |
| `e2e/login.e2e.ts` | new, 2 tests, both unconditional |
| `e2e/auth-redirect.e2e.ts` | new, 1 test, unconditional |
| `e2e/booking-page.e2e.ts` | new, 2 tests (1 gated) |
| `e2e/auth-live.e2e.ts` | new, 2 tests (both gated, serial) |
| `e2e/README.md` | new |
| `package.json` | `+ "test:e2e": "playwright test"`, `+ "test:e2e:ui": "playwright test --ui"`, placed after `test:watch` |
| `vitest.config.ts` | `exclude: ['**/node_modules/**', '**/.claude/worktrees/**', '**/e2e/**']` |
| `.gitignore` | `+ test-results/`, `+ playwright-report/`, `+ .playwright/` under a `# playwright` comment |
| `.github/workflows/e2e.yml` | new, `workflow_dispatch` only |

The `.gitignore` entries are **unanchored**, matching the literal strings AC12 asks for and covering a
future `e2e/test-results/` or a per-project `outputDir` as well as the configured root-level ones.
`.env*` is already ignored, so a `.env.local` copied in for the acceptance run cannot be committed.

Nothing under `app/`, `lib/`, `components/`, or `workers/`; no `README.md`, no
`developer-docs/TODO.md`. Report-only on any application bug (NFR1).

`show-report` gets no script — `pnpm exec playwright show-report` is in the README instead, keeping
the `package.json` diff to exactly the two scripts FR2 asks for.

## CI workflow

`.github/workflows/e2e.yml`. What it inherits from `migrations.yml` is the house style, not the steps:
a leading comment block naming every secret it reads, `permissions: contents: read`, a `concurrency`
group, pinned action majors, and a `name:` on every step. The pnpm/Node setup has no precedent in
that file (it uses `supabase/setup-cli@v1` only), so it is specified here outright:

```yaml
# Runs the Playwright E2E suite on demand. Dispatch-only on purpose: the suite
# is new and some of its tests need seeded Supabase data, so it must not be able
# to gate a merge yet.
#
# Optional GitHub repository secrets. With none of them set the job still runs
# the four unconditional tests green (playwright.config.ts injects placeholder
# Supabase values) and skips the other three:
#   - NEXT_PUBLIC_SUPABASE_URL              : app Supabase project URL
#   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  : app publishable (anon) key
#   - SUPABASE_SECRET_KEY                   : app service-role key
#   - E2E_BOOKING_SLUG                      : org slug with booking_page_enabled = true
#   - E2E_USER_EMAIL                        : test user that owns an organization
#   - E2E_USER_PASSWORD                     : that user's password
name: E2E

on: workflow_dispatch

permissions:
  contents: read

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
      SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
      E2E_BOOKING_SLUG: ${{ secrets.E2E_BOOKING_SLUG }}
      E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
      E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          # package.json has no `packageManager` field, so the action needs an
          # explicit version or it errors out.
          version: 10

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          # The installed @supabase/* 2.112.2 family declares engines
          # node >= 22.0.0; 24 matches the dev machine (v24.16.0).
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Chromium
        run: pnpm exec playwright install --with-deps chromium

      - name: Run E2E suite
        run: pnpm test:e2e

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

All six secrets are optional, and that promise now actually holds: a dispatch with none of them set
binds each `env:` entry to the empty string, `readEnv` treats that as absent, and
`placeholderSupabaseEnv` supplies working placeholders — so the four unconditional tests run green and
the other three skip. The same six names are listed in the leading comment block (FR8.1).

It cannot gate merges: with no `push` or `pull_request` trigger there is no commit status for a
branch-protection rule to require. That is visible in the trigger block, as FR8.2 demands, rather than
relying on `continue-on-error`. The workflow ships **unexecuted** — GitHub Actions cannot run locally
— and `e2e/README.md` says so plainly, which is precisely why it is dispatch-only.

## `e2e/README.md` outline

- **Run commands**: `pnpm test:e2e`, `pnpm test:e2e:ui`, `pnpm exec playwright test e2e/login.e2e.ts`,
  `--trace on`, `pnpm exec playwright show-report`.
- **One-time setup**: `pnpm install`, `pnpm exec playwright install chromium`.
- **Env var table** (the one from this design) including: the `E2E_BASE_URL` ⇒ no-local-server rule
  and the distinct meaning of `E2E_NO_WEB_SERVER`; the blank-means-absent rule; the line that
  **gates follow the runner's environment — when testing a remote origin with `E2E_BASE_URL`, set the
  gating variables locally too**, or the Supabase-dependent tests will skip even though the target
  could serve them; and the data prerequisites spelled out (which org must have
  `booking_page_enabled`; the test user must simply own an organization — there is no TOTP
  prerequisite, because TOTP in this app is enrolment-only and the dashboard layout performs no
  assurance-level check).
- **Deviations from the requirements, both carried here on purpose**: the FR1.3 `baseURL` default
  (`http://localhost:3000` → `http://127.0.0.1:3100`) and how to restore it, and the FR5.1 choice to
  drive the login form rather than inject a programmatic `storageState` session, with the
  `@supabase/ssr` cookie-format reasoning and the "revisit at ~three authenticated tests" threshold.
- **Which tests skip and why**, by variable name.
- **The naming rule** (`*.e2e.ts`, never `*.test.ts`) and the two-layer isolation reason, as the
  "how to add a spec" section.
- **Where artifacts land**: `test-results/`, `playwright-report/`, both gitignored.
- **The dev-server choice** and the single production fallback, verbatim in pwsh with `$env:PORT`
  set to the harness port.
- **CI**: `.github/workflows/e2e.yml` is `workflow_dispatch`-only, has never been executed, and all
  six secrets are optional.
- **Troubleshooting**: (a) the unknown-slug 404 also passes when the database is unreachable;
  (b) the ~7 s postgrest retry backoff per `getOrganizationBySlug` call and the two calls per
  booking-page render, so slow is not hung; (c) the first dev compile needs outbound network for
  `next/font/google`; (d) a 500 on every route usually means a blank Supabase value somewhere the
  harness could not see.
- **Future load testing** (closing paragraph): names the targets — the voice path (`startPublicCall`
  → LiveKit room join, and the AssemblyAI relay server actions) and the booking endpoints
  (`app/smb/actions.ts`'s `createPublicAppointment` plus the availability engine) — and states that
  load testing was out of scope for this run.

## Testability and verification

The harness is itself the test layer, so there is little to unit test: `e2e/support/env.ts` is a
reader plus getters, and `global-setup.ts`'s only logic is a loop with a swallowed catch. Both are
excluded from Vitest by design, so a unit test for them would need an opt-in include and is not worth
it. What *is* testable is the harness's own behaviour, and that is checked mechanically. The steps are
ordered, and the two acceptance runs are named so the AC2 evidence is unambiguous.

1. `pnpm install` and `pnpm exec playwright install chromium` inside the worktree.
2. **Capture the Vitest baseline before any change** (`pnpm test`), saving both the collected-file
   list and the failure set. The brief's figure is 10 failures across `app/smb/actions.test.ts`,
   `lib/data/analytics.test.ts`, `lib/data/availability-engine.test.ts`,
   `lib/voice/adapters/fish-audio-tts.test.ts`; `AGENTS.md` still records an older 3-file figure, so
   this machine's measured state is the comparison basis for AC4, not either document.
3. Write the files, then `pnpm exec playwright test --list` — expect only `e2e/*.e2e.ts` entries, and
   no `*.test.ts(x)` from `app/`, `lib/`, or `components/` (AC5). Confirm `e2e/support/*.ts` and
   `e2e/README.md` appear in neither runner's collection.
4. Re-run `pnpm test` and diff against step 2: identical file list, identical failure set (AC4).
5. **Run A — bare worktree.** Confirm there is no `.env.local` in the worktree, then `pnpm test:e2e`.
   Expected: **4 passed, 3 skipped** (`login.e2e.ts` ×2, `auth-redirect.e2e.ts`, the booking 404;
   skipped: the live-slug booking test, both `auth-live.e2e.ts` tests). This run is the AC2 "green on
   a bare machine" claim. Run it **twice** to show stability. Paste the output.
6. `Copy-Item e:\Projects\frontdesk-ai\.env.local .` into the worktree (permitted by NFR3; already
   covered by `.gitignore`'s `.env*`, and no value from it is ever printed).
7. **Run B — configured.** `pnpm test:e2e`. Expected: **5 passed, 2 skipped** — the sign-in error
   toast test now runs because `supabaseConfigured` is true. If `E2E_BOOKING_SLUG` and/or
   `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` can also be supplied for a real org and user, set them and
   expect 6 or 7 passed; run that twice so the authenticated journey's `retries: 0` determinism is
   shown (AC10), and if it cannot pass twice, convert it to a documented `test.skip`. Paste the
   output.
8. Report Run A and Run B separately. **Never claim a gated test passed in Run A**, and never claim a
   pass for a test that skipped — name the missing variables instead.
9. `pnpm exec tsc --noEmit` clean (AC13); `pnpm exec eslint` on the touched files only (AC14).
10. Deliberate-failure smoke check: temporarily break one assertion, confirm a trace and screenshot
    land in `test-results/`, then revert. This is how AC1's "trace and screenshot on failure" is
    actually verified rather than asserted.
11. `git status` clean of Playwright artifacts and of `.env.local` (AC12);
    `git diff --name-only main...feat/e2e-harness` limited to the ownership set (AC15).
12. Commit on `feat/e2e-harness`; no merge, no rebase, `main` untouched (AC16).

Unit-vs-integration split, stated plainly: there is nothing here worth unit testing, every spec is an
integration test against a live app, and the harness's own correctness (collection boundaries, the
env rule, artifact capture) is verified by the mechanical checks in steps 3, 4, 5 and 10 rather than
by assertions in code.

## Edge cases

- **Blank env values** — handled by the single `readEnv` rule; the two failure modes it prevents (a
  falsy-check throw in `@supabase/ssr`, and `@next/env` treating `''` as present and so ignoring
  `.env.local`) are documented above.
- **Another agent's dev server on 3000** — sidestepped by the dedicated 3100 port; `E2E_PORT` moves it
  again if 3100 is also taken.
- **Cold compile on first navigation** — moved into `globalSetup`, which has no per-test timeout; the
  residual is covered by the 60 s navigation / 90 s test budgets.
- **Postgrest retry backoff** — ~7 s per `getOrganizationBySlug` call with an unreachable database, and
  `/smb/[slug]` makes two calls (`generateMetadata` + page component, no `React.cache()`), so ~14 s is
  inside the budget and documented so it is not read as a hang.
- **Native email validation** — avoided entirely by asserting the empty-password branch.
- **Theme provider absent on `/login`** — `next-themes` is mounted only in the dashboard and settings
  layouts, so `components/ui/sonner.tsx` falls back to `theme: 'system'`. The toast still renders; no
  test asserts colours, so light/dark is irrelevant here.
- **Booking page config variability** — handled by asserting a structural attribute, not copy.
- **`notFound()` status under dev/Turbopack** — unexecuted assumption; the heading is the primary
  assertion and the status line is dropped and reported if dev answers 200.
- **Account state for the authenticated test** — `/` and `/onboarding` both accepted, and one
  `getByRole('main')` covers both because exactly one `<main>` exists per route repo-wide
  (`app/(auth)/layout.tsx`, `app/not-found.tsx`, `app/smb/[slug]/not-found.tsx`,
  `components/onboarding/onboarding-ui.tsx`, `components/ui/sidebar.tsx`'s `SidebarInset` — never two
  on the same page; `DashboardMain` renders a `div`). `/login` also has a `<main>`, which is why the URL
  assertion, not the landmark, is what proves the session took.
- **`/onboarding`'s intro animation** — `OnboardingClient` paints `IntroSequence` first, a fixed-overlay
  animation with `setTimeout` phases at 700/1800/2800 ms and no `<main>`; only
  `CreationWizard → SourceStep → OnboardingShell` emits one. The 10 s `expect` timeout absorbs the
  ~2.8 s delay.
- **Strict-mode locator ambiguity** — `exact: true` on "Sign in" and "Password". No `.first()` anywhere:
  `Sidebar()` returns one of three mutually exclusive branches, so exactly one `[data-slot="sidebar"]`
  exists at a time and a `.first()` would defend against nothing while hiding a future duplicate from
  strict mode.
- **Windows paths and shell** — no shell operators in any script; `path.resolve(__dirname, ...)` for the
  dotenv path; `127.0.0.1` rather than `localhost`; the production fallback written in pwsh `$env:`
  form.
- **`pnpm test:e2e` with no browser installed** — Playwright's own error names the exact install
  command; the README repeats it as step one.

## Application observations (report only, per NFR1)

Turnstile verification in `app/smb/actions.ts` is dead code. Both call sites read
`process.env.TURNSTILE_SECRET_KEY` and then guard with `if (false && turnstileSecret)` (lines 89 and
325). Their comments reference a `showTurnstile` flag that no longer exists in
`booking-page-public-client.tsx`, and `components/voice/turnstile.tsx` has **no importers anywhere in
the repo**, so the widget can never render. The public booking and manage-booking actions therefore
perform no bot verification today regardless of configuration. This is reported, not fixed — it is
application source owned by other runs — and it is also why no spec needs Cloudflare's test keys
(FR4.6 is moot). Note that `app/smb/actions.test.ts` has a case named "requires a turnstile token when
TURNSTILE_SECRET_KEY is configured" (line 132), which is part of the pre-existing failing baseline and
consistent with the feature being switched off.

A second, smaller observation for the hand-off report: the installed dependency tree declares
`engines: node >= 22.0.0` across the `@supabase/*` 2.112.2 family and `node >= 22` for `ai@7` /
`@ai-sdk/*`, while `devDependencies` pins `@types/node: ^20`. Nothing is broken (the dev machine runs
v24.16.0 and `engine-strict` is off), but the type definitions describe an older runtime than the one
the code requires. Reported only; `package.json`'s dependency block is not this run's to change.

---

## Responses to design review findings (revision 2 → 3)

All 10 findings are addressed. Nothing is backlogged or ignored.

| # | Sev | Response |
| --- | --- | --- |
| 1 | MEDIUM | **Addressed.** `??` is gone from every env read. A single `readEnv(name)` in `e2e/support/env.ts` treats blank as absent, and `playwright.config.ts` imports it — so the rule has one implementation shared by the config, the gates and the warm-up, and `E2E_PORT` / `E2E_BASE_URL` / `E2E_NO_WEB_SERVER` are now blank-aware too (a CI `E2E_PORT: ''` would previously have thrown on `Number('')`). New section "The one env rule: blank means absent" states the rule and both failure modes. Re-verified the `@supabase/ssr` falsy check (`createServerClient.js:11-13`) and Playwright's merge order (`runner/index.js:858-862`), and found a second reason the review did not name: `@next/env@16.4.0` snapshots `initialEnv` and `processEnv` applies a `.env.local` key only when `typeof initialEnv[key] === 'undefined'`, so a blank inherited value also **suppresses** the real `.env.local` value inside the dev server. Passing a placeholder instead of `''` fixes both at once. |
| 2 | MEDIUM | **Addressed.** The verification plan now has twelve ordered steps with the `.env.local` copy as an explicit numbered step (6) between two named runs: **Run A** (bare worktree → 4 passed / 3 skipped, the "green on a bare machine" AC2 claim) and **Run B** (configured → 5 passed / 2 skipped, more if the slug and user variables are supplied). Both outputs get pasted, reported separately, and step 8 states outright that no gated test may be claimed as passing in Run A. The config comment no longer presumes `.env.local` exists ("when one is present"), and the contradictory closing paragraph is deleted. |
| 3 | MEDIUM | **Addressed.** Option A is documented verbatim in pwsh (`$env:PORT = '3100'; pnpm build; pnpm start` in one terminal, `$env:E2E_NO_WEB_SERVER = '1'; pnpm test:e2e` in another) and option B is explicitly dropped as the fallback, with the reason stated: two ways to do one thing. `E2E_NO_WEB_SERVER` keeps one meaning ("something is already listening on `E2E_PORT`") and `E2E_BASE_URL` keeps the other ("test this other origin"), both spelled out in the env table. Verified the premise directly: the generated standalone entry point reads `parseInt(process.env.PORT, 10) || 3000` at runtime (`next/dist/build/utils.js:1204`) with `HOSTNAME` defaulting to `0.0.0.0`, so setting `PORT` does move it to 3100. |
| 4 | MEDIUM | **Addressed.** CI is `node-version: 24`, matching the measured local runtime (v24.16.0), with an inline comment naming the real floor. The stack line is rewritten to "Node 22+", citing `engines: {node: '>=22.0.0'}` across the `@supabase/*` 2.112.2 family at `pnpm-lock.yaml:1978-2006` (and `node >= 22` for `ai@7` / `@ai-sdk/*`, which I checked while I was there), and stating that `@types/node: ^20` is a pre-existing devDependency rather than evidence of the runtime. 24 was chosen over 22 so CI matches the only environment where the suite is ever actually executed. The `@types/node` mismatch is added to the application observations as report-only, since `package.json`'s dependency block is not this run's to change. |
| 5 | NIT | **Addressed.** `import { config as loadEnv } from 'dotenv'` with `loadEnv({ path: path.resolve(__dirname, '.env.local'), quiet: true })`, matching `scripts/dev-voice.ts:2`. |
| 6 | NIT | **Addressed.** Every CI step has a `name:` — Checkout, Install pnpm, Setup Node, Install dependencies, Install Chromium, Run E2E suite, Upload Playwright report — and the workflow also gained the leading secrets comment block and a top-level `name: E2E`, completing the `migrations.yml` house style the design claims. |
| 7 | NIT | **Addressed.** `E2E_BASE_URL` is validated with `new URL()` beside the `E2E_PORT` check and throws naming the offending value. The env table's "Type / limits" cell says "validated", and the validation section now justifies *per variable* why `E2E_PORT` and `E2E_BASE_URL` are validated while the three data variables are not — both of the validated ones fail slowly and misleadingly, the others fail immediately and legibly. |
| 8 | NIT | **Addressed.** Renamed to `'shows a visible error toast when sign-in is rejected'`. The tolerant regex is kept, and the design now explains why the stricter alternative was rejected: asserting `'Incorrect email or password'` exactly would convert a test that needs *configured* env into one that needs a *reachable and responsive* project, which buys no coverage this harness owns. The test's comment carries the same reasoning. |
| 9 | NIT | **Addressed.** `e2eEnv.supabaseConfigured`'s doc comment says it reads the runner's environment, and the README's env table gains the line "gates follow the runner's environment — when testing a remote origin with `E2E_BASE_URL`, set the gating variables locally too", with the consequence (a skip, never a false pass) spelled out. |
| 10 | NIT | **Addressed.** The FR5.1 deviation paragraph now ends with an explicit statement that it is carried into `e2e/README.md` and the final report, and the README outline has a dedicated "Deviations from the requirements" bullet holding both FR1.3 (port) and FR5.1 (form-driven sign-in), each with its reasoning and, for FR1.3, the exact override. |

Two further changes not requested by any finding, both made while verifying the above:

- `e2eEnv`'s fields became **getters**, so the gates are read when a test asks rather than at module
  import time. This removes any dependence on whether the config's dotenv load ran before `env.ts`
  was first imported in a worker process — a latent ordering assumption in revision 2 that became
  load-bearing once `playwright.config.ts` started importing the same module.
- In the booking 404 test, the heading assertion now precedes the status assertion, and the design
  states what happens if Next 16.4 dev answers 200 instead of 404: the status line is dropped and the
  discrepancy is reported as an application observation. Revision 2 left the unexecuted assumption
  sitting in the primary position.
