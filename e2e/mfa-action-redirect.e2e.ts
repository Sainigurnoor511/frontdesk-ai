import { test, expect, type Page } from '@playwright/test'
import { e2eEnv } from './support/env'
import { totpCode } from './support/totp'

// The contract under test: when a Server Action is submitted with a session that still owes its
// TOTP code, proxy.ts answers with an `x-action-redirect: /verify;replace` header (not a 3xx), and
// Next's action client follows it into a navigation. proxy.test.ts pins the header; only a real
// browser driving a real action proves the installed Next actually follows it, so a Next upgrade
// that changes the reducer contract fails here instead of leaving an open tab stuck.
//
// A deterministic pending session needs a real account with a verified TOTP factor, which is why
// this is env-gated like auth-live.e2e.ts. See e2e/README.md for the prerequisites.

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/verify', { timeout: 30_000 })
}

test('a Server Action submitted with a pending session lands the tab on /verify', async ({
  context,
}) => {
  test.skip(
    !e2eEnv.authConfigured ||
      !e2eEnv.mfaUserEmail ||
      !e2eEnv.mfaUserPassword ||
      !e2eEnv.mfaTotpSecret,
    'Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY plus E2E_MFA_USER_EMAIL, E2E_MFA_USER_PASSWORD and E2E_MFA_TOTP_SECRET for a Supabase user with a verified TOTP factor who owns an organization with at least one receptionist, and a reachable REDIS_URL for the dev server (the attempt budget fails closed without it)'
  )
  const email = e2eEnv.mfaUserEmail!
  const password = e2eEnv.mfaUserPassword!

  // Tab A: complete both factors and land inside the app, so it holds rendered UI whose
  // controls are Server Actions.
  const tabA = await context.newPage()
  await signIn(tabA, email, password)
  await tabA.getByLabel('Authentication code').fill(totpCode(e2eEnv.mfaTotpSecret!))
  await expect(tabA).toHaveURL((url) => url.pathname === '/', { timeout: 30_000 })
  await expect(tabA.getByRole('button', { name: 'Account menu' })).toBeVisible()

  // Tab B, same browser context and so the same cookie jar: a fresh password sign-in replaces the
  // aal2 session with a pending aal1 one. Tab A still shows the dashboard it rendered earlier.
  const tabB = await context.newPage()
  await signIn(tabB, email, password)

  // Tab A submits a Server Action (`logOut`, POSTed to `/` with a Next-Action header). Had the
  // action run, the tab would end on /login; the proxy refuses it first, so it must end on /verify.
  await tabA.getByRole('button', { name: 'Account menu' }).click()
  await tabA.getByRole('menuitem', { name: 'Log out' }).click()

  await expect(tabA).toHaveURL((url) => url.pathname === '/verify', { timeout: 30_000 })
  await expect(tabA.getByRole('heading', { name: 'Enter your authentication code' })).toBeVisible()
})
