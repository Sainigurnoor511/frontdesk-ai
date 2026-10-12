import { test, expect } from '@playwright/test'
import { e2eEnv } from './support/env'

// Serial: both tests hit Supabase auth on the same project. Running them in
// parallel invites a rate limit that has nothing to do with what is under test.
test.describe.configure({ mode: 'serial' })

test('shows a visible error toast when sign-in is rejected', async ({ page }) => {
  test.skip(
    !e2eEnv.authConfigured,
    'Needs a reachable Supabase project: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (copy .env.local from the main checkout)'
  )
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('e2e-nobody@example.com')
  await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  // A raw attribute selector because sonner exposes no role/name for the error
  // variant. Declared as the FR4.5 deviation in e2e/README.md.
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
    !e2eEnv.authConfigured || !e2eEnv.userEmail || !e2eEnv.userPassword,
    'Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY plus E2E_USER_EMAIL and E2E_USER_PASSWORD for a Supabase user that owns an organization'
  )
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(e2eEnv.userEmail!)
  await page.getByLabel('Password', { exact: true }).fill(e2eEnv.userPassword!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  // logIn() redirects to '/'; the dashboard layout then sends accounts with no
  // agent on to /onboarding. Both are a successful sign-in — and neither path
  // is reachable without a session, which is what makes this the auth
  // assertion. A URL predicate rather than /\/(onboarding)?$/, which would also
  // match any path ending in a slash.
  await expect(page).toHaveURL((url) => url.pathname === '/' || url.pathname === '/onboarding', {
    timeout: 30_000,
  })
  // Exactly one <main> exists per route in this app: SidebarInset on the
  // dashboard, OnboardingShell on /onboarding. One assertion covers both
  // branches. /login also has a <main>, which is why the URL assertion — not
  // the landmark — is what proves the session took.
  await expect(page.getByRole('main')).toBeVisible()
})
