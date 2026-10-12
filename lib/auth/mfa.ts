import type { AuthError, User } from '@supabase/supabase-js'

/**
 * Authenticator Assurance Level gate.
 *
 * No `server-only` import here on purpose: this module is consumed by `proxy.ts` (the request
 * interception layer), Server Components, server actions, and Vitest, so it has to stay
 * context-neutral — the same split as `lib/supabase/service-role.ts` vs `lib/supabase/server.ts`.
 * The Supabase client is injected rather than constructed, matching `getOrgId(supabase)` in
 * `app/(settings)/settings/actions.ts`.
 *
 * MODULE CONTRACT: no exported function in this file ever rejects. Both Supabase calls it makes can
 * throw rather than return `{ error }` (auth-js leaves the no-argument AAL branch unwrapped and
 * `_getUser` rethrows non-`AuthError`s), and the gate runs inside `proxy()` where a rejection would
 * 500 every matched request — including the `/login` and `/verify` screens a pending user needs in
 * order to end the session. Every call is wrapped and every failure maps to a deny state.
 */

export const MFA_VERIFY_PATH = '/verify'
export const POST_LOGIN_PATH = '/'
export const MFA_ATTEMPTS_COOKIE = 'fd_mfa_attempts'
export const MFA_ATTEMPTS_MAX_AGE_SECONDS = 10 * 60
export const MFA_MAX_ATTEMPTS = 5

/**
 * Attributes for `fd_mfa_attempts`. `secure` comes from `NODE_ENV` because the writers run inside
 * server actions with no `NextRequest` in scope; `app/(auth)/callback/route.ts` keeps its
 * request-derived `secure` for `fd_password_recovery`, where a request object is available.
 */
export const MFA_ATTEMPTS_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MFA_ATTEMPTS_MAX_AGE_SECONDS,
} as const

/** Minimal structural shape so tests can pass partial fakes without casting whole clients. */
export type MfaAwareClient = {
  auth: {
    getUser(): Promise<{ data: { user: User | null }; error: AuthError | null }>
    mfa: {
      getAuthenticatorAssuranceLevel(): Promise<{
        data: { currentLevel: string | null; nextLevel: string | null } | null
        error: AuthError | null
      }>
    }
  }
}

export type MfaGate =
  | { state: 'unauthenticated' }
  | { state: 'satisfied' }
  | { state: 'pending'; factorId: string; email: string }
  | { state: 'indeterminate' }

/**
 * Resolves the gate for an already-validated user.
 *
 * PRECONDITION: `user` MUST come from `supabase.auth.getUser()` on the same client instance in the
 * same request. The `currentLevel` read below trusts the access token's `aal` claim, and
 * `decodeJWT` does not verify signatures — the claim is only trustworthy because that same token
 * was just validated server-side by the `getUser()` call that produced `user`. Passing a user from
 * any other source (a decoded cookie, a cached value, `signInWithPassword`'s `data.user`) voids the
 * guarantee.
 *
 * `nextLevel` is deliberately never read: auth-js derives it from `session.user.factors`, which
 * under `@supabase/ssr` is the unsigned browser cookie, so trusting it would be a one-cookie-edit
 * bypass of the whole feature.
 *
 * Never rejects. A thrown error from the AAL read is mapped to `indeterminate`.
 */
export async function resolveMfaGateForUser(
  supabase: MfaAwareClient,
  user: User | null
): Promise<MfaGate> {
  if (!user) return { state: 'unauthenticated' }

  // An unexpected factor-list shape fails closed. `undefined` is "no enrolled factors", which is
  // exactly how `mfa.listFactors()` reads the identical GoTrue `/user` response.
  if (user.factors !== undefined && !Array.isArray(user.factors)) {
    return { state: 'indeterminate' }
  }

  // `status === 'verified'` alone, with no factor-type filter, because that is how auth-js itself
  // decides a session requires aal2. Filtering on TOTP here would call an un-elevated session with
  // a verified non-TOTP factor `satisfied`, which is the one direction that fails open.
  const verified = (user.factors ?? []).filter((factor) => factor.status === 'verified')
  if (verified.length === 0) return { state: 'satisfied' }

  let aal
  try {
    aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  } catch {
    return { state: 'indeterminate' }
  }
  if (aal.error || !aal.data) return { state: 'indeterminate' }

  // Before the factor pick, so an already-elevated session is satisfied whatever its factor types.
  if (aal.data.currentLevel === 'aal2') return { state: 'satisfied' }

  // A missing `aal` claim lands here as pending, which is the fail-closed direction.
  const totp = verified.find((factor) => factor.factor_type === 'totp')
  if (!totp) return { state: 'indeterminate' }

  // The factor id comes from the server's own factor list, never from the request.
  return { state: 'pending', factorId: totp.id, email: user.email ?? '' }
}

/**
 * Resolves the gate, fetching the user itself. Used where no validated user is in hand: the
 * interception layer, the login action, the OAuth callback, and the `/verify` screen.
 *
 * Never rejects. A thrown error from `getUser()` is mapped to `unauthenticated`, which is already
 * the app's behavior for a failed `getUser()`.
 */
export async function resolveMfaGate(supabase: MfaAwareClient): Promise<MfaGate> {
  let result
  try {
    result = await supabase.auth.getUser()
  } catch {
    return { state: 'unauthenticated' }
  }
  if (result.error || !result.data.user) return { state: 'unauthenticated' }
  return resolveMfaGateForUser(supabase, result.data.user)
}

/** Convenience for the data-layer helpers that already hold a validated user. */
export async function isMfaSatisfiedForUser(
  supabase: MfaAwareClient,
  user: User | null
): Promise<boolean> {
  return (await resolveMfaGateForUser(supabase, user)).state === 'satisfied'
}

// An allowlist, so any route added later is gated by default.
const MFA_EXEMPT_PREFIXES = [
  '/verify', // the challenge screen itself, and the POST target for its actions
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/callback',
  '/smb', // public per-org booking pages, no dashboard data
  '/api/webhooks', // machine callers, signature-authenticated, no user session
  '/api/livekit/endpoint', // public non-secret LIVEKIT_URL, fetched by the public booking page
  '/_next', // build output, image optimizer and dev HMR; RSC payload requests use
  // the page path and stay gated
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
  '/llms.txt',
  '/brand',
]

/** Exact-or-segment-boundary matching, so `/verify-email` does not inherit `/verify`'s exemption. */
export function isMfaExemptPath(pathname: string): boolean {
  return MFA_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export type MfaErrorMapping = {
  /** User-facing copy, derived from the error condition and never from `error.message`. */
  message: string
  /** End the pending session instead of letting the user retry. */
  fatal: boolean
  /** Supabase's own throttling, so the local attempt counter must not advance. */
  throttled: boolean
}

/** Maps a Supabase MFA error onto house-style copy. All three fields are always present. */
export function mfaErrorMessage(error: AuthError): MfaErrorMapping {
  switch (error.code) {
    case 'mfa_verification_failed':
      return {
        message: 'That code is not right. Check your authenticator app and try again.',
        fatal: false,
        throttled: false,
      }
    case 'mfa_verification_rejected':
      return {
        message: 'That code was rejected. Try the next one from your app.',
        fatal: false,
        throttled: false,
      }
    case 'mfa_challenge_expired':
    case 'otp_expired':
      return {
        message: 'That code expired. Enter the current code from your app.',
        fatal: false,
        throttled: false,
      }
    case 'over_request_rate_limit':
      return {
        message: 'Too many attempts. Please wait a few minutes and try again.',
        fatal: false,
        throttled: true,
      }
    case 'mfa_factor_not_found':
      return {
        message: 'Your two-factor setup is no longer available. Please sign in again.',
        fatal: true,
        throttled: false,
      }
    case 'mfa_ip_address_mismatch':
      return {
        message: 'Your network changed during sign-in. Please sign in again.',
        fatal: true,
        throttled: false,
      }
    case 'mfa_totp_verify_not_enabled':
    case 'insufficient_aal':
      return {
        message: 'Two-factor sign-in is unavailable right now. Please try again later.',
        fatal: true,
        throttled: false,
      }
    default:
      // Fallbacks for servers that omit `code`, consistent with `friendlyAuthError`.
      if (error.status === 429 || error.message.includes('rate limit')) {
        return {
          message: 'Too many attempts. Please wait a few minutes and try again.',
          fatal: false,
          throttled: true,
        }
      }
      return {
        message: 'Could not verify that code. Please try again.',
        fatal: false,
        throttled: false,
      }
  }
}
