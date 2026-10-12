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
   * A second test account, with a *verified TOTP factor*, for the MFA specs. Separate from
   * `E2E_USER_*` on purpose: enrolling a factor on that account would send the existing
   * authenticated journey to /verify. The secret is the base32 string shown at enrolment.
   */
  get mfaUserEmail(): string | null {
    return readEnv('E2E_MFA_USER_EMAIL')?.trim() ?? null
  },
  get mfaUserPassword(): string | null {
    return readEnv('E2E_MFA_USER_PASSWORD') ?? null
  },
  get mfaTotpSecret(): string | null {
    return readEnv('E2E_MFA_TOTP_SECRET')?.trim() ?? null
  },
  /**
   * True when the runner's environment supplies a real project for the *auth*
   * path — the browser-side client built by `createBrowserClient` and the
   * server client in `proxy.ts`. This is what the sign-in tests need.
   *
   * The config's placeholders go only into `webServer.env`, never into this
   * process, so presence here is sufficient — there is nothing to distinguish
   * from.
   *
   * Note this reads the *runner's* environment, not the target app's: see the
   * README's env table for what that means when testing a remote origin.
   */
  get authConfigured(): boolean {
    return Boolean(
      readEnv('NEXT_PUBLIC_SUPABASE_URL') && readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    )
  },
  /**
   * True when the runner's environment supplies a real project for the
   * *service-role* path. `getOrganizationBySlug` resolves a booking slug with
   * `createServiceRoleClient()`, which reads NEXT_PUBLIC_SUPABASE_URL and
   * SUPABASE_SECRET_KEY — a different pair from `authConfigured`, which is why
   * there are two getters rather than one named "supabaseConfigured".
   */
  get serviceRoleConfigured(): boolean {
    return Boolean(readEnv('NEXT_PUBLIC_SUPABASE_URL') && readEnv('SUPABASE_SECRET_KEY'))
  },
}
