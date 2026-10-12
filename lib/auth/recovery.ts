import type { AuthError } from '@supabase/supabase-js'

/**
 * How long after a reset link was used the session it created may still set a new password.
 * Measured from the `recovery` entry's timestamp in the access token's `amr` claim.
 */
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 15 * 60

/** Clock skew tolerated on a `recovery` timestamp that is slightly in the future. */
const CLOCK_SKEW_SECONDS = 60

/** Minimal structural shape, so tests can pass a partial fake without casting whole clients. */
export type ClaimsAwareClient = {
  auth: {
    getClaims(jwt?: string): Promise<{
      data: { claims: { amr?: unknown } } | null
      error: AuthError | null
    }>
  }
}

/**
 * True only when the caller's access token is **signature-verified** and its `amr` claim records a
 * password-recovery sign-in within the last `PASSWORD_RECOVERY_MAX_AGE_SECONDS`.
 *
 * This is the proof that the requester opened a reset link from the account's mailbox. It
 * replaces an `fd_password_recovery=1` cookie whose mere presence was the proof: the cookie was
 * unsigned and bound to nothing, so any signed-in session could send it and change the password
 * without a reset link.
 *
 * WHY `getClaims()`. In auth-js 2.112.2 it verifies the JWT signature with WebCrypto against the
 * project's JWKS, and for a symmetric (HS256) or `kid`-less token it falls back to a `getUser(jwt)`
 * round trip, which GoTrue validates (`GoTrueClient.getClaims`). Either way the claims returned
 * are signed by the auth server. A locally base64-decoded token would be as forgeable as the
 * cookie was.
 *
 * WHY `amr`. GoTrue builds `amr` from the session's `mfa_amr_claims` rows
 * (`Session.CalculateAALAndAMR`). A PKCE recovery link is exchanged with the `recovery`
 * authentication method, and a later TOTP verification only adds a `totp` row to the same session
 * (`AddClaimToSession` in `updateMFASessionAndClaims`), so `recovery` survives the aal2 upgrade
 * with its original timestamp. Every token of that session carries it, which is why the
 * timestamp, not its presence, bounds the window.
 *
 * Plain-string `amr` entries (RFC 8176 form) carry no timestamp, so they cannot prove recency and
 * are not accepted. Never rejects; every failure is `false`.
 */
export async function hasRecentRecoveryClaim(
  supabase: ClaimsAwareClient,
  options: { jwt?: string; now?: number } = {}
): Promise<boolean> {
  let result
  try {
    result = await supabase.auth.getClaims(options.jwt)
  } catch {
    return false
  }
  if (result.error || !result.data) return false

  const amr = result.data.claims.amr
  if (!Array.isArray(amr)) return false

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000)
  return amr.some((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return false
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown }
    return (
      method === 'recovery' &&
      typeof timestamp === 'number' &&
      timestamp >= nowSeconds - PASSWORD_RECOVERY_MAX_AGE_SECONDS &&
      timestamp <= nowSeconds + CLOCK_SKEW_SECONDS
    )
  })
}
