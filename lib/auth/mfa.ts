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

/**
 * Code-attempt budget per user, and how long the lockout lasts. The counter lives in Redis keyed by
 * user id (`lib/auth/mfa-attempts.ts`), not in a cookie: a request-supplied counter is reset by
 * simply omitting it, so the number would imply protection it does not give. Each attempt is
 * reserved atomically before the code reaches Supabase; once `MFA_MAX_ATTEMPTS` are used the user
 * is locked out for the remainder of `MFA_ATTEMPTS_TTL_SECONDS`, and a fresh password sign-in does
 * not clear it — that reset was the other half of the same hole.
 */
export const MFA_MAX_ATTEMPTS = 5
export const MFA_ATTEMPTS_TTL_SECONDS = 10 * 60

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

/**
 * `indeterminate` is a deny state everywhere. `reason` only refines the copy `/verify` shows; it
 * never changes the decision, which is why it is an optional field on the existing state rather
 * than a new state that every consumer of the gate would have to remember to deny.
 *
 * - `unsupported_factor`: the account's verified factors include none this app can challenge
 *   (only TOTP is supported), so no amount of retrying will get it through. Reachable only through
 *   a factor enrolled outside the app, such as project-level phone MFA or the admin API.
 */
export type MfaIndeterminateReason = 'unsupported_factor'

export type MfaGate =
  | { state: 'unauthenticated' }
  | { state: 'satisfied' }
  | { state: 'pending'; userId: string; factorId: string; email: string }
  | { state: 'indeterminate'; reason?: MfaIndeterminateReason }

/**
 * Resolves the gate for an already-validated user.
 *
 * NOT EXPORTED, and that is the point. The `currentLevel` read below trusts the access token's
 * `aal` claim, and `decodeJWT` does not verify signatures — the claim is only trustworthy because
 * the same token was just validated server-side by the `getUser()` call that produced `user`. A
 * user from any other source (a decoded cookie, a cached value, `signInWithPassword`'s
 * `data.user`) would void that guarantee, so the only way in is `resolveMfaGate` or
 * `getAssuredUser` below, both of which make the validating call themselves. Documenting the
 * precondition was not enough: nothing in the signature could enforce it.
 *
 * `nextLevel` is deliberately never read: auth-js derives it from `session.user.factors`, which
 * under `@supabase/ssr` is the unsigned browser cookie, so trusting it would be a one-cookie-edit
 * bypass of the whole feature.
 *
 * Never rejects. A thrown error from the AAL read is mapped to `indeterminate`.
 */
async function resolveMfaGateForUser(
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
  if (!totp) return { state: 'indeterminate', reason: 'unsupported_factor' }

  // The user id and the factor id both come from the server's own validated `getUser()` response,
  // never from the request: `userId` keys the failed-attempt counter, so a requester-supplied
  // value there would be the same hole the cookie counter had.
  return { state: 'pending', userId: user.id, factorId: totp.id, email: user.email ?? '' }
}

/**
 * GoTrue error codes that positively say "this request carries no usable session". Anything not
 * listed here is not evidence of a signed-out caller. From `ErrorCode` in
 * `@supabase/auth-js/dist/main/lib/error-codes.d.ts` (2.112.2), plus `invalid_jwt`, which
 * `AuthInvalidJwtError` sets.
 */
const SESSION_ABSENT_CODES = new Set([
  'bad_jwt',
  'invalid_jwt',
  'no_authorization',
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'user_not_found',
  'user_banned',
])

/**
 * Classifies a `getUser()` error that was *returned*, not thrown.
 *
 * Only a clearly absent or invalid session is `unauthenticated`, because that is a pass-through
 * state in `proxy.ts`. auth-js 2.112.2 turns a fetch failure and any 5xx (and the Cloudflare 52x
 * range) into `AuthRetryableFetchError` inside `handleError()` (`lib/fetch.js`), and `_getUser()`
 * then *returns* it as `{ data: { user: null }, error }` instead of throwing — so treating every
 * returned error as "signed out" waved pending sessions through the proxy during a GoTrue outage.
 * Retryable, server-side, rate-limited and unrecognized errors are all `indeterminate`.
 *
 * Structural checks (`name`, `code`, `status`) rather than auth-js's `isAuth*Error` helpers, which
 * test a private `__isAuthError` marker: the shape is what the SDK documents, and it keeps this
 * module's fakes honest.
 */
function classifyReturnedGetUserError(error: AuthError): MfaGate {
  // No access token at all, or GoTrue says the token's `session_id` is gone (`session_not_found`
  // is rewritten to this class in `handleError()`).
  if (error.name === 'AuthSessionMissingError') return { state: 'unauthenticated' }

  if (error.name === 'AuthRetryableFetchError') return { state: 'indeterminate' }
  if (typeof error.status === 'number' && (error.status >= 500 || error.status === 429)) {
    return { state: 'indeterminate' }
  }

  if (error.code && SESSION_ABSENT_CODES.has(error.code)) return { state: 'unauthenticated' }

  // A code-less 401/403 from GoTrue is the server rejecting the credential (older servers omit
  // `code`). Only for `AuthApiError`, which is the class built from a real HTTP response.
  if (error.name === 'AuthApiError' && (error.status === 401 || error.status === 403)) {
    return { state: 'unauthenticated' }
  }

  return { state: 'indeterminate' }
}

/**
 * Resolves the gate, fetching the user itself. Used where no validated user is in hand: the
 * interception layer, the login action, the OAuth callback, and the `/verify` screen.
 *
 * Never rejects, and fails closed in both directions the SDK can fail:
 * - A *thrown* `getUser()` (auth-js rethrows anything that is not an `AuthError`) means the check
 *   could not be performed, so it is `indeterminate`.
 * - A *returned* error is `unauthenticated` only when it positively says the session is absent or
 *   invalid; see `classifyReturnedGetUserError`.
 * - No error and no user is a shape the SDK does not produce, so it is not evidence of anything
 *   and is `indeterminate` as well.
 */
export async function resolveMfaGate(supabase: MfaAwareClient): Promise<MfaGate> {
  let result
  try {
    result = await supabase.auth.getUser()
  } catch {
    return { state: 'indeterminate' }
  }
  if (result.error) return classifyReturnedGetUserError(result.error)
  if (!result.data.user) return { state: 'indeterminate' }
  return resolveMfaGateForUser(supabase, result.data.user)
}

/**
 * THE authorization entry point for every privileged server action, route handler and data helper.
 *
 * Returns the caller only when the session is both authenticated *and* past the TOTP gate;
 * anything else is `null`, which every call site already handles as "not signed in". Use this
 * instead of `supabase.auth.getUser()` anywhere a database write, a queue job, a service-role
 * client or a paid provider call follows — `getUser()` alone is satisfied by a pending `aal1`
 * session, and the proxy is not a substitute (Next's own proxy reference, `proxy.md:251`, says
 * authorization has to be repeated inside each server function).
 *
 * It also keeps `resolveMfaGateForUser`'s precondition intact by construction: the user it gates
 * on is the one its own `getUser()` just validated, so no caller can hand it a user from an
 * unvalidated source.
 *
 * Never rejects. Every failure direction, including a thrown `getUser()`, returns `null`.
 */
export async function getAssuredUser(supabase: MfaAwareClient): Promise<User | null> {
  let result
  try {
    result = await supabase.auth.getUser()
  } catch {
    return null
  }
  const user = result.data.user
  if (result.error || !user) return null
  return (await resolveMfaGateForUser(supabase, user)).state === 'satisfied' ? user : null
}

/**
 * For `fetch` clients of gated `/api/*` routes: the path to navigate to when a response is
 * `proxy.ts`'s two-factor denial (401 with `verifyPath`), otherwise `null`. Only the app's own
 * challenge path is ever returned, whatever the body says, so a response body can never steer the
 * browser somewhere else.
 */
export function mfaVerifyPathFromDenial(status: number, body: unknown): string | null {
  if (status !== 401 || typeof body !== 'object' || body === null) return null
  return (body as { verifyPath?: unknown }).verifyPath === MFA_VERIFY_PATH ? MFA_VERIFY_PATH : null
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
