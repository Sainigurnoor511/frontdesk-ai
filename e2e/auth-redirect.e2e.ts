import { test, expect } from '@playwright/test'

// `/` is an app/(dashboard) route; the layout calls getCurrentOrgAndUser() and
// redirect('/login') when it returns null. Deterministic even with placeholder
// Supabase env: with no session cookie GoTrue short-circuits getUser() without
// a network call, so the layout takes the null-session branch on a fixed code
// path rather than on a timing-dependent failure.
test('unauthenticated dashboard access redirects to /login', async ({ page }) => {
  await page.goto('/')
  // Asserting the final URL *and* the login heading closes the loophole where
  // a redirect chain ends somewhere unexpected.
  await expect(page).toHaveURL(/\/login(\?.*)?$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})
