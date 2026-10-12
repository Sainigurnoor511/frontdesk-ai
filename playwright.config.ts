import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import { e2eEnv, readEnv } from './e2e/support/env'

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
// The dev server is bound to the same host below, which is load-bearing — see
// the `--hostname` note on `webServer.command`.
const host = '127.0.0.1'
const serverUrl = `http://${host}:${port}`
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
 * missing secrets and hands over empty strings — see e2e/README.md's env table.
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
    // 60s, not 30s: /smb/[slug] pays a ~7s postgrest retry backoff per
    // getOrganizationBySlug call, and the route makes two calls per render when
    // the database is unreachable. See e2e/README.md's troubleshooting notes.
    navigationTimeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: useWebServer
    ? {
        // `--hostname` is not cosmetic. Next 16 dev blocks cross-origin
        // requests to /_next/* dev resources, and the default allowlist is
        // `['**.localhost', 'localhost', <bind hostname>]`
        // (next/dist/server/lib/router-utils/block-cross-site-dev.js). Served
        // on the default hostname and browsed as 127.0.0.1, every chunk request
        // comes back 403, the page never hydrates, and any test that needs
        // client JS fails for a reason that looks nothing like its cause.
        // Binding to the host the suite browses puts it on the allowlist
        // without touching next.config.ts.
        command: `pnpm dev --port ${port} --hostname ${host}`,
        url: serverUrl,
        reuseExistingServer: !process.env.CI,
        // Cold Next 16 dev start + first route compile on Windows.
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        // REDIS_URL is passed explicitly, from the same getter the MFA spec probes, so the spec's
        // skip gate and the server's attempt budget always look at the same Redis.
        env: { ...placeholderSupabaseEnv, REDIS_URL: e2eEnv.redisUrl },
      }
    : undefined,
})
