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
  // Only a foreign origin is left cold on purpose: `E2E_BASE_URL` means "test
  // this other origin", and warming someone else's deployment is not ours to
  // do. `E2E_NO_WEB_SERVER` means "something is already listening on
  // E2E_PORT" — often a hand-started `pnpm dev` whose routes are cold, which
  // is exactly the case the warm-up exists for, so it still warms.
  if (readEnv('E2E_BASE_URL')) return
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
