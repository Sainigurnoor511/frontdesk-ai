import { test, expect } from '@playwright/test'

// `exact: true` on both "Sign in" and "Password" is required, not cosmetic:
// Playwright's role-name and label matching is case-insensitive *substring* by
// default, so "Sign in" would also match GoogleButton's "Sign in with Google"
// and "Password" would also match the show/hide toggle's "Show password".
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
    // The empty-password branch, not a malformed email: the email input is
    // type="email" on a form without noValidate, so Chromium's native
    // validation would block submission and the Zod error would never render.
    // zodResolver(loginSchema): password.min(1, 'Password is required'),
    // rendered as <p class="text-sm text-destructive"> by the login form.
    await expect(page.getByText('Password is required')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })
})
