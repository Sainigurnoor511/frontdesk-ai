import { test, expect } from '@playwright/test'
import { e2eEnv } from './support/env'

// A fixed, obviously-absent slug — no clock, no randomness. The heading
// assertion comes first and the status second, deliberately: the rendered
// not-found.tsx body is the behaviour under test, the HTTP status corroborates.
//
// This proves routing only. It passes both when the org genuinely does not
// exist and when the database is unreachable, because getOrganizationBySlug
// destructures only `data` and ignores `error`, so both produce null.
test('unknown slug renders the booking 404', async ({ page }) => {
  const response = await page.goto('/smb/e2e-nonexistent-org-do-not-create')
  await expect(page.getByRole('heading', { name: 'Booking page not found' })).toBeVisible()
  expect(response?.status()).toBe(404)
})

test('public booking page loads for a configured slug', async ({ page }) => {
  // The slug is resolved with the service-role client
  // (getOrganizationBySlug -> createServiceRoleClient), so NEXT_PUBLIC_SUPABASE_URL
  // and SUPABASE_SECRET_KEY are co-preconditions: with only the slug set, the
  // config's placeholders make the lookup return null and the route 404s.
  test.skip(
    !e2eEnv.serviceRoleConfigured || !e2eEnv.bookingSlug,
    'Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (the slug is resolved with the service-role client) and E2E_BOOKING_SLUG pointing at an organization whose organization_settings.booking_page_enabled is true'
  )
  await page.goto(`/smb/${e2eEnv.bookingSlug!}`)
  // A structural attribute, not copy: every visible string on this page —
  // tagline, header, tab bar, receptionist panel — is switchable through
  // booking_page_config, while data-booking-public-root sits outside every
  // config-dependent branch. Declared as the FR4.5 deviation in e2e/README.md.
  await expect(page.locator('[data-booking-public-root]')).toBeVisible()
  // Makes a silently-404ing slug fail loudly instead of passing vacuously.
  await expect(page.getByRole('heading', { name: 'Booking page not found' })).toHaveCount(0)
})
