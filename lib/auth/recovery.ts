import type { AuthError } from '@supabase/supabase-js'

/** How long after opening a reset link its session may still set a new password. */
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 15 * 60

/** Clock skew tolerated on a `recovery` timestamp that is slightly in the future. */
const CLOCK_SKEW_SECONDS = 60

/** Minimal structural shape, so tests can pass a partial fake without casting whole clients. */
export type ClaimsAwareClient = {
  auth: {
    getClaims(jwt?: string): Promise<{
      data: { claims: { amr?: unknown; sub?: unknown } } | null
      error: AuthError | null
    }>
  }
}

/** Only `valid` permits a password change; `unverifiable` means "try again", not "expired". */
export type RecoveryClaim =
  | { status: 'valid'; userId: string }
  | { status: 'absent' }
  | { status: 'unverifiable' }

/** auth-js returns AuthRetryableFetchError for fetch failures and 5xx; the token may be fine. */
function isTransportError(error: { name?: string; status?: number }): boolean {
  if (error.name === 'AuthRetryableFetchError') return true
  return typeof error.status === 'number' && (error.status >= 500 || error.status === 429)
}

/**
 * Proof that the caller opened a reset link: a signature-verified token whose `amr` has a
 * `{ method: 'recovery' }` entry stamped within PASSWORD_RECOVERY_MAX_AGE_SECONDS. Never rejects.
 *
 * `getClaims()` (auth-js 2.112.2) verifies the signature against the project JWKS with WebCrypto,
 * or by a `getUser(jwt)` round trip for HS256/kid-less tokens; never decode the JWT locally.
 * Replaces the unsigned `fd_password_recovery=1` cookie, which any signed-in session could forge.
 */
export async function checkRecoveryClaim(
  supabase: ClaimsAwareClient,
  options: { jwt?: string; now?: number } = {}
): Promise<RecoveryClaim> {
  let result
  try {
    result = await supabase.auth.getClaims(options.jwt)
  } catch {
    // auth-js rethrows non-AuthErrors, such as a fetch TypeError.
    return { status: 'unverifiable' }
  }

  if (result.error) {
    return isTransportError(result.error) ? { status: 'unverifiable' } : { status: 'absent' }
  }
  if (!result.data) return { status: 'absent' }

  const { amr, sub } = result.data.claims
  if (!Array.isArray(amr) || typeof sub !== 'string' || !sub) return { status: 'absent' }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000)
  // Every token of a recovery session carries the entry, so its timestamp bounds the window.
  // String-form entries (RFC 8176) have no timestamp and cannot prove recency.
  const recent = amr.some((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return false
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown }
    return (
      method === 'recovery' &&
      typeof timestamp === 'number' &&
      timestamp >= nowSeconds - PASSWORD_RECOVERY_MAX_AGE_SECONDS &&
      timestamp <= nowSeconds + CLOCK_SKEW_SECONDS
    )
  })

  return recent ? { status: 'valid', userId: sub } : { status: 'absent' }
}
