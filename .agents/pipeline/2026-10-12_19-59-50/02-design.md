# Design — enforce TOTP two-factor at login

**Revision 3.** Rewritten against `03-design-review.md` / `design-review.json` (review 2,
CHANGES_REQUESTED: 0 HIGH, 3 MEDIUM, 8 NIT). Every finding is addressed, backlogged, or answered in
"Responses to design review findings" at the end; the body below is the design as it now stands,
not a diff.

## Overview

`logIn` in `app/(auth)/actions.ts` treats a successful `signInWithPassword` as a completed login,
and nothing in the app looks at the session's Authenticator Assurance Level. This design adds one
authoritative predicate — "is this session pending MFA?" — in a new `lib/auth/mfa.ts`, and wires it
into the password login action, the OAuth callback, the request-interception layer (`proxy.ts`), the
shared server context helper `getCurrentOrgAndUser()`, and the ten shared data-layer read helpers
that resolve the user themselves. A new `/verify` screen in the `(auth)` route group runs
`mfa.challenge()` + `mfa.verify()` and completes the login.

Tech stack, locked: Next.js 16.4 App Router with `proxy.ts` request interception, Supabase Auth MFA
(`supabase.auth.mfa.*`) through `@supabase/ssr` + `@supabase/supabase-js`, Zod 3 schemas in
`lib/validations/`, React 19 client component with **local `useState`** (no react-hook-form on this
screen — see "The verify form"), shadcn/ui on `@base-ui/react` with the vendored
`components/ui/input-otp.tsx` primitive, `lucide-react` icons, Vitest (jsdom, globals) for tests. No
new dependencies: `input-otp@^1.4.2` is already a direct dependency and `package.json` is not
touched.

## Threat model and the central decision

The obvious implementation is wrong, and this is the load-bearing part of the design.
`supabase.auth.mfa.getAuthenticatorAssuranceLevel()` derives `nextLevel` from
`session.user.factors` read out of local session storage — which, under `@supabase/ssr`, is the
browser cookie. Verified in `@supabase/auth-js@2.112.2`
(`node_modules/.pnpm/@supabase+auth-js@2.112.2/.../dist/main/GoTrueClient.js`,
`_getAuthenticatorAssuranceLevel`, no-argument branch at `:5038-5060`):

```js
const { data: { session } } = await this.getSession()
const { payload } = decodeJWT(session.access_token)
let currentLevel = payload.aal ?? null
let nextLevel = currentLevel
const verifiedFactors = session.user.factors?.filter(f => f.status === 'verified') ?? []
if (verifiedFactors.length > 0) nextLevel = 'aal2'
```

The session cookie's `user` object is not signed, and auth-js says so in `getSession()`'s own doc
comment: *"If using an insecure storage medium, such as cookies or request headers, the user object
returned by this function must not be trusted."* An attacker who knows the password but not the TOTP
secret could sign in, edit the cookie to delete `user.factors`, and
`getAuthenticatorAssuranceLevel()` would report `currentLevel: 'aal1', nextLevel: 'aal1'` — looks
satisfied, gate opens. A one-cookie-edit bypass of the whole feature.

So the two halves of the decision come from two different places:

- **"has a verified factor"** comes from `supabase.auth.getUser()`. In this auth-js version
  `getUser()` always round-trips to the GoTrue `/user` endpoint (`_getUser`, `GoTrueClient.js:2679-2704`
  — no local-JWKS shortcut), so `user.factors` is the server's answer, not the cookie's. It is the
  same read `mfa.listFactors()` performs internally (`_listFactors` calls `this.getUser()` first,
  `:4985`, then `user?.factors ?? []`).
- **`currentLevel`** is read from the access token via `getAuthenticatorAssuranceLevel()`, and only
  `currentLevel` — `nextLevel` is never consulted.

**Why `currentLevel` is trustworthy, stated accurately.** `decodeJWT` performs *no* signature
verification (verified at `@supabase/auth-js@2.112.2/dist/main/lib/helpers.js:177-199`: split on
`.`, base64url regex check, `JSON.parse`, return — the signature bytes are returned, never checked).
Reading `payload.aal` out of a client-supplied cookie is, on its own, exactly as forgeable as
reading `user.factors`. The claim is trustworthy only because of an **ordering dependency**: the
`getUser()` that produced `user` sent *that same access token* to GoTrue `/user`, which does verify
it. A forged `aal2` token fails `getUser()` first and the gate returns `unauthenticated` before the
AAL is ever read.

That ordering dependency is a precondition, and it goes in the code as a TSDoc comment because
`resolveMfaGateForUser` accepts a caller-supplied `user`:

```ts
/**
 * PRECONDITION: `user` MUST come from `supabase.auth.getUser()` on the same client instance in
 * the same request. The `currentLevel` read below trusts the access token's `aal` claim, and
 * `decodeJWT` does not verify signatures — the claim is only trustworthy because that same token
 * was just validated server-side by the `getUser()` call that produced `user`. Passing a user from
 * any other source (a decoded cookie, a cached value, `signInWithPassword`'s `data.user`) voids
 * the guarantee.
 */
```

## Latency: no additional per-navigation round-trip

Requirement 26 bounds the cost, and both gated paths already pay for a `getUser()`:

- `lib/supabase/middleware.ts` `updateSession()` calls `await supabase.auth.getUser()` on every
  non-static request, purely to trigger the cookie refresh.
- `lib/data/organization.ts` `getCurrentOrgAndUser()` calls `supabase.auth.getUser()` as its first
  statement. The ten data-layer read helpers do the same.

`lib/auth/mfa.ts` therefore exposes two entry points:

- `resolveMfaGate(supabase)` does its own `getUser()`. **`updateSession` uses this form, and its
  internal `getUser()` replaces the one `updateSession` makes today** — so the proxy's call count is
  unchanged.
- `resolveMfaGateForUser(supabase, user)` is for callers that already hold a validated user.
  `getCurrentOrgAndUser` and the ten data helpers use this form with the user they already fetched.

`getAuthenticatorAssuranceLevel()` adds no round-trip beyond the `getUser()` that already ran:
`getSession()` reads storage and can call `_callRefreshToken` when the access token has expired, but
on both gated paths the preceding `getUser()` has already refreshed the session, so the net
additional cost is zero. (It is not strictly network-free in isolation — that qualification matters
only if a future caller invokes it without a preceding `getUser()`.) NFR 26 is a measurable claim
and goes on the manual verification list rather than being asserted as measured.

`resolveMfaGate` (the fetching form) is also used on the login action, the OAuth callback, the
`/verify` page, and the verify action — all low-frequency, non-navigation paths.

**Rejected alternative:** deriving the factor list from `signInWithPassword`'s returned `data.user`
instead of a fresh `getUser()` on the login path. That response is server-authoritative, so it
would be sound, and it would save one round-trip on the login path only. Rejected because it splits
the gate into two code paths with two different sources for `user`, which is exactly the shape the
TSDoc precondition above warns against; one unambiguous `getUser()` on the login path is the better
trade. (This is a code-shape argument, not an argument about `factors` being ambiguous — see the
next section.)

## New module: `lib/auth/mfa.ts`

No `server-only` import. It is consumed by `proxy.ts` (interception layer), Server Components,
server actions, and Vitest, so per the `lib/supabase/service-role.ts` vs `server.ts` split
convention it must stay context-neutral. It takes the Supabase client as a parameter rather than
constructing one — the same dependency-injection shape as `getOrgId(supabase)` in
`app/(settings)/settings/actions.ts:16`, which is also what makes it trivially mockable.

**Module contract: no exported function in this file ever rejects.** Both Supabase calls it makes
can throw, not merely return `{ error }` (see "The two calls can throw" below), and the gate runs
inside `proxy()` where a rejection would 500 every matched request — including the `/verify` and
`/login` screens the pending user needs in order to escape. Every call is therefore wrapped, and
every failure is mapped to a deny-state value.

```ts
import type { AuthError, User } from '@supabase/supabase-js'

export const MFA_VERIFY_PATH = '/verify'
export const POST_LOGIN_PATH = '/'
export const MFA_ATTEMPTS_COOKIE = 'fd_mfa_attempts'
export const MFA_ATTEMPTS_MAX_AGE_SECONDS = 10 * 60
export const MFA_MAX_ATTEMPTS = 5

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

/** Never rejects. A thrown error from `getUser()` is mapped to `unauthenticated`. */
export async function resolveMfaGate(supabase: MfaAwareClient): Promise<MfaGate>

/** Never rejects. A thrown error from the AAL read is mapped to `indeterminate`. */
export async function resolveMfaGateForUser(
  supabase: MfaAwareClient,
  user: User | null
): Promise<MfaGate>

/** `(await resolveMfaGateForUser(...)).state === 'satisfied'` — convenience for data helpers. */
export async function isMfaSatisfiedForUser(
  supabase: MfaAwareClient,
  user: User | null
): Promise<boolean>

export function isMfaExemptPath(pathname: string): boolean

export function mfaErrorMessage(error: AuthError): {
  message: string
  fatal: boolean
  throttled: boolean
}
```

That `mfaErrorMessage` return shape is the one and only declared contract: all three fields are
always present, and every row of the mapping table under "Error mapping" sets all three.
`verifyMfaChallenge` reads `mapped.throttled`, so a two-field declaration would be a typecheck
error (NFR 27) and would leave AC10's "rate-limit errors do not increment the counter" decision
resting on an unpromised field.

`resolveMfaGateForUser` logic, in order:

1. `user` is null → `{ state: 'unauthenticated' }`.
2. **Factor list shape check, then the verified-factor test.** `user.factors` is `undefined` or an
   array; anything else is an unexpected response shape → `{ state: 'indeterminate' }` (fail closed
   per NFR 25):
   ```ts
   if (user.factors !== undefined && !Array.isArray(user.factors)) return { state: 'indeterminate' }
   const verified = (user.factors ?? []).filter((f) => f.status === 'verified')
   if (verified.length === 0) return { state: 'satisfied' }
   ```
   The test is `status === 'verified'` alone, deliberately **not** `factor_type === 'totp' && status
   === 'verified'`. auth-js itself derives `nextLevel` from `status === 'verified'` with no factor-type
   filter (`GoTrueClient.js:5025` and `:5055`), so a user with a verified non-TOTP factor — a phone
   factor enrolled by any other client against the same Supabase project — would be reported as
   requiring `aal2` by Supabase while a TOTP-only filter would call the `aal1` session `satisfied`.
   That is the fail-open direction, the one direction NFR 25 rules out. The factor type is used
   later, at step 5, only to pick which factor to challenge.

   `undefined` is treated as "no enrolled factors", and that is not a fail-open guess: `user` here
   is the GoTrue `/user` response, and `undefined` is precisely what `mfa.listFactors()` treats as
   "none" on the identical read (`_listFactors` → `user?.factors ?? []`, `GoTrueClient.js:4996`).
   Verified against auth-js 2.112.2. This is the no-TOTP common path and it returns before touching
   the AAL API at all, so a user without two-factor is completely unaffected (requirement 2).
3. Read the assurance level, wrapped:
   ```ts
   let aal
   try {
     aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
   } catch {
     return { state: 'indeterminate' }
   }
   if (aal.error || !aal.data) return { state: 'indeterminate' }
   ```
4. `aal.data.currentLevel === 'aal2'` → `{ state: 'satisfied' }`.
5. Pick the factor to challenge:
   ```ts
   const totp = verified.find((f) => f.factor_type === 'totp')
   if (!totp) return { state: 'indeterminate' }
   return { state: 'pending', factorId: totp.id, email: user.email ?? '' }
   ```
   Refusing when the only verified factor is not TOTP is correct rather than lenient: TOTP-only is an
   explicit out-of-scope constraint, so there is no screen that could complete a phone challenge, and
   returning `indeterminate` keeps `mfa.challenge()` from ever sending an SMS. `indeterminate` is a
   deny state with terminal copy, so such a user is signed out with "two-factor sign-in is
   unavailable" rather than being let in.

The order matters: the `aal2` check at step 4 runs **before** the TOTP-pick at step 5, so a session
that is already fully elevated is `satisfied` regardless of which factor types the account holds. An
account with only a verified non-TOTP factor can therefore still use the app once elevated by
whatever client enrolled that factor; it is only the un-elevated case that is refused.

Step 5 never consults `nextLevel`. Reaching it means the Auth server says a verified factor exists
and the token says the session is not `aal2`. A `currentLevel` of `null` (no `aal` claim) falls into
step 5 as pending, which is the fail-closed direction. One verified detail worth recording: when
there is no session at all, the AAL call returns `{ currentLevel: null, nextLevel: null }` with
`error: null` (`GoTrueClient.js:5044-5049`) rather than an error, so the `null` → pending mapping is
what keeps that case closed. It is unreachable in practice because step 3 is only reached after a
successful `getUser()`. `factorId` comes from the server-provided factor list, never from the
request, so a client cannot point the challenge at a factor it does not own.

`resolveMfaGate(supabase)`, also wrapped:

```ts
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
```

### The two calls can throw

This is why the wrappers above are not belt-and-braces. Verified in `@supabase/auth-js@2.112.2`:

- `_getAuthenticatorAssuranceLevel()`'s no-argument branch (`GoTrueClient.js:5038-5060`) calls
  `decodeJWT(session.access_token)` and dereferences `session.user.factors` **outside any
  try/catch** — only the `jwt`-argument branch is wrapped (`:5014-5037`). `decodeJWT` throws
  `AuthInvalidJwtError` on a token that is not three base64url parts
  (`lib/helpers.js:177-187`), and `session.user` is dereferenced without a guard, so a malformed or
  truncated cookie produces a rejection, not an `{ error }` result.
- `_getUser` catches, but rethrows anything that is not an `AuthError` (`:2704-2715`), so a
  fetch/abort/DNS failure surfaces as a rejection.

Collapsing a `getUser()` failure into `unauthenticated` rather than a distinct error state is
deliberate: every consumer denies on both, and the app's existing behavior for a failed `getUser()`
is already "treat as signed out" (`getCurrentOrgAndUser` returns null → `redirect('/login')`). A
Supabase outage logging people out is pre-existing behavior, not a regression introduced here.

### `indeterminate` is one behavior, and it terminates

`indeterminate` means "we could not establish that the session satisfies its required assurance
level". It always denies, and every consumer either ends the session or shows terminal copy. No
consumer silently lets it pass, and no pair of consumers can bounce a request between each other:

| Consumer | Behavior on `indeterminate` | Why |
| --- | --- | --- |
| `logIn` | `return endPendingSession(supabase, 'mfa_unavailable')` → signed out → `/login?error=mfa_unavailable` | Terminal, with copy. Ends the loop at its source |
| `verifyMfaChallenge` | same | Same reasoning |
| `proxy.ts` | redirect to `/verify` (gated on `pending \|\| indeterminate`) | A session in this state must not sit on a protected route |
| `/verify` page | renders a terminal "two-factor sign-in is unavailable" panel with a "Sign in again" submit button posting to `cancelMfaChallenge` | A Server Component cannot reliably sign out (its cookie writes are swallowed), so it must not `redirect('/login')` and leave a live session the proxy will bounce again. It shows copy and an action instead |
| `getCurrentOrgAndUser`, the ten data helpers | deny (`null` / `[]`) | `state !== 'satisfied'`, fail closed |

Trace the case: a TOTP user hits an AAL read failure. `logIn` → signed out →
`/login?error=mfa_unavailable` with a friendly message. If the state arises mid-session instead:
any protected navigation → proxy → `/verify` → unavailable panel → "Sign in again" → signed out →
`/login`. Terminal in both directions, never silent, never a loop.

Worth noting how rare this is: `getAuthenticatorAssuranceLevel()` errors essentially only when
there is no session or the stored token is malformed, and step 3 is only reached when `getUser()`
just succeeded. The state exists for the unexpected-shape, malformed-token, non-TOTP-factor, and
API-change cases, and an already-`aal2` user who somehow hits it is bounced through a re-login —
acceptable fail-closed cost.

### Exempt paths

`isMfaExemptPath` uses exact-or-segment-boundary matching, not bare `startsWith`, so `/verify-email`
would not inherit `/verify`'s exemption:

```ts
const MFA_EXEMPT_PREFIXES = [
  '/verify',               // the challenge screen itself, and the POST target for its actions
  '/login', '/signup', '/forgot-password', '/reset-password', '/callback',
  '/smb',                  // public per-org booking pages, no dashboard data
  '/api/webhooks',         // machine callers, signature-authenticated, no user session
  '/api/livekit/endpoint', // public non-secret LIVEKIT_URL, fetched by the public booking page
  '/_next',                // build output, image optimizer and dev HMR; RSC payload requests use
                           // the page path and stay gated
  '/favicon.ico', '/robots.txt', '/sitemap.xml', '/manifest.webmanifest',
  '/llms.txt',             // public/llms.txt, which the matcher catches (review 3, finding 8)
  '/brand',
]

export function isMfaExemptPath(pathname: string): boolean {
  return MFA_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
```

An allowlist, so anything added to the app later is gated by default. `/manifest.webmanifest` is
listed because `app/manifest.ts` is served at that path and `config.matcher` does not exclude it
(`app/icon.svg`, `apple-icon.png`, and `opengraph-image.tsx` are covered by the matcher's image
extensions). Everything not listed is gated, including `/api/assistant` and
`/api/conversations/[id]/recording` (both read organization-scoped data and both call
`supabase.auth.getUser()` today) and `/api/integrations/*/callback` (calendar linking, only
meaningful from an authenticated dashboard).

## Enforcement layer 1: `proxy.ts` and `lib/supabase/middleware.ts`

Per the Next 16 proxy reference
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:249`):

> **Good to know:** Server Functions are not separate routes in this chain. They are handled as
> POST requests to the route where they are used, so a Proxy matcher that excludes a path will also
> skip Server Function calls on that path.

(Review 3's finding 7 corrected the paraphrase, which is applied above. Its line-number half does
not hold against the installed copy: the passage is at `:249` and the authorization warning at
`:251`, as originally cited — re-checked in the worktree's `node_modules` during implementation.)

The existing matcher excludes only static assets and image extensions, so every page navigation,
every RSC payload request, and every server-action POST passes through `proxy()`. That makes the
proxy a genuine gate for server actions, not only for navigations — the action never executes
because the redirect is returned before the route is rendered. The same page warns at `:251` not to
rely on the proxy alone, which is why layers 2 and 3 exist.

`updateSession` changes shape to hand its work back to the caller, and captures the cache headers
`@supabase/ssr` supplies alongside auth cookies:

```ts
// lib/supabase/middleware.ts
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const authHeaders: Record<string, string> = {}

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        Object.assign(authHeaders, headers)
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
        Object.entries(headers).forEach(([k, v]) => supabaseResponse.headers.set(k, v))
      },
    },
  })

  // resolveMfaGate's internal getUser() both validates the access token and triggers the
  // cookie refresh that setAll() writes into supabaseResponse. It replaces the bare
  // getUser() this function used to make, so the request count is unchanged. It never
  // rejects, so no try/catch is needed here.
  const mfa = await resolveMfaGate(supabase)

  // Read supabaseResponse *after* the await: setAll() reassigns it inside the closure,
  // so capturing it earlier would drop the refreshed cookies.
  return { response: supabaseResponse, mfa, authHeaders }
}
```

The `headers` parameter is mandatory in `@supabase/ssr`'s `SetAllCookies` type and documents exactly
why (`node_modules/@supabase/ssr/dist/main/types.d.ts:23-52`): *"Responses that set auth cookies
must not be cached by CDNs or reverse proxies, otherwise one user's session token can be served to
a different user."* The library passes `Cache-Control: private, no-cache, no-store,
must-revalidate, max-age=0`, `Expires: 0`, `Pragma: no-cache`. The repo ships an nginx reverse proxy
(`docker/nginx.conf`), so a cached 307-with-`Set-Cookie` is not hypothetical.

> **Version note.** `@supabase/ssr` is pinned to `"latest"` in `package.json` (which this run must
> not edit), and the two-argument `setAll` was verified against the installed 0.12.4. If a worktree
> reinstall resolves a version whose `SetAllCookies` takes one parameter, TypeScript will reject the
> two-parameter callback. Fallback in that case: drop the `headers` parameter and use a local
> constant instead — `const AUTH_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-cache,
> no-store, must-revalidate, max-age=0', Expires: '0', Pragma: 'no-cache' }` — applied at the same
> points. The security property is identical; only the source of the header values changes.

```ts
// proxy.ts
export async function proxy(request: NextRequest) {
  const { response, mfa, authHeaders } = await updateSession(request)

  const needsChallenge = mfa.state === 'pending' || mfa.state === 'indeterminate'
  if (needsChallenge && !isMfaExemptPath(request.nextUrl.pathname)) {
    const redirectResponse = NextResponse.redirect(new URL(MFA_VERIFY_PATH, request.url))
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie)
    }
    for (const [key, value] of Object.entries(authHeaders)) {
      redirectResponse.headers.set(key, value)
    }
    return redirectResponse
  }

  return response
}
```

Copying the `Set-Cookie` values onto the redirect is required, not cosmetic: dropping them discards
a token Supabase just refreshed and signs the user out mid-flow. `ResponseCookies.set` accepts a
single `ResponseCookie` object, so `redirectResponse.cookies.set(cookie)` typechecks.
`config.matcher` is unchanged.

The proxy acts only on `pending` and `indeterminate`. `unauthenticated` falls through to the
existing layout-level `redirect('/login')`, and `satisfied` passes through untouched. Narrowing the
proxy to exactly the new behavior keeps the blast radius minimal: the public booking pages, the auth
screens, and today's login redirects keep working byte-for-byte. No redirect loop is possible
because `MFA_VERIFY_PATH` is itself exempt, and — because `resolveMfaGate` never rejects — no gate
failure can 500 the exempt screens the pending user needs.

## Enforcement layer 2: `getCurrentOrgAndUser()`

One additive edit to `lib/data/organization.ts`:

```ts
export async function getCurrentOrgAndUser(): Promise<CurrentOrgAndUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // A session that still owes a TOTP code is not an authenticated session. Returning null
  // routes it into the same path every caller already has for "not signed in".
  if (!(await isMfaSatisfiedForUser(supabase, user))) return null

  // ...unchanged members lookup
}
```

Returning `null` rather than throwing or adding a return variant is the decisive choice: all 16
existing consumers already handle `null`, so there is no caller to update and no caller that can
forget. Verified consumer list (**16** call sites, **16** files, excluding the definition):
`app/(dashboard)/{page,layout}.tsx`, `app/(dashboard)/{agents,analytics,assistant,availability,
booking-page,business,calendar,phone-numbers,staff}/page.tsx`,
`app/(dashboard)/agents/[id]/page.tsx:20`,
`app/(dashboard)/analytics/actions.ts:38`, `app/(settings)/settings/page.tsx`,
`app/onboarding/layout.tsx`, `app/smb/access.ts`. Server Components get `redirect('/login')`, and
`getAnalyticsForRange` in `app/(dashboard)/analytics/actions.ts:34-41` — a genuine
organization-scoped server action — returns `{ error: 'You must be signed in to view analytics.' }`.
That is a refusal, not a redirect, which is what acceptance criterion 6 asks for literally.

One route is worth naming: `app/(dashboard)/agents/[id]/page.tsx` calls `getAgentById(id)` and
`notFound()` at line 19 *before* resolving `getCurrentOrgAndUser()` at line 20, so "layer 2 gates
before any protected read" is not literally true there. Nothing renders (the redirect follows) and
layer 1 prevents arriving at the route at all, which is what covers it.

`isMfaSatisfiedForUser` is false for `indeterminate` as well as `pending`, which is the fail-closed
posture NFR 25 requires.

Two consequences worth stating rather than discovering later. `app/smb/access.ts`
`isOrganizationMember()` will return `false` for a pending session, so a pending-MFA owner viewing
their own booking page is treated as a stranger — and if that page has `bookingPageEnabled` off,
`canUseBookingPage()` denies. Fail-closed, leaks nothing, accepted. And this layer is intentionally
redundant with the proxy: if the matcher is ever narrowed, Server Component rendering stays gated.

## Enforcement layer 3: the shared data-layer read helpers

Requirements assumption 6 — that `getCurrentOrgAndUser` is *the* server-side chokepoint — is false.
There are **72** `auth.getUser(` call sites across **29** non-test files under `app/` and `lib/`;
`getCurrentOrgAndUser` backs **16** of them (mostly `page.tsx` / `layout.tsx`), while the mutating
server actions resolve the user inline, action by action, in **18** files inside `(dashboard)`,
`(settings)`, and `onboarding`. (Re-counted during implementation with `-LiteralPath` recursion;
review-3 finding 1 is confirmed. `Select-String -Path` and glob-based searches treat `[id]` as a
character class and silently skip bracketed dynamic-route directories, which is how the earlier
60/28 figure arose.)

**The rule for this layer: it covers exactly the shared `lib/data` read helpers that resolve the
caller themselves.** Helpers that take an organization id from their caller and do no user lookup
are *not* covered and never will be — they inherit whatever gate their caller has. Concretely, the
ten covered functions (all verified at the cited lines in the worktree):

| File | Functions | Return shape today |
| --- | --- | --- |
| `lib/data/clients.ts` | `getClientsForOrg` (`:12`) | `getUser()` → `if (!user) return []` |
| `lib/data/conversations.ts` | `getConversationsForOrg` (`:125`), `getConversationNavCounts` (`:152`), `getConversationById` (`:204`), `getCallerMessagesForOrg` (`:234`), `getConversationRecordingUrl` (`:261`) | same, returning `[]` / `null` / an empty-counts object |
| `lib/data/integrations.ts` | `getEnabledIntegrationsForOrg` (`:8`) | `return []` |
| `lib/data/phone-numbers.ts` | `getPhoneNumbersForOrg` (`:23`) | `return []` |
| `lib/data/staff.ts` | `getStaffForOrg` (`:15`) | `return []` |
| `lib/data/sidebar-preferences.ts` | `getHiddenSidebarItems` (`:3`) | `return []` (takes an org id *and* resolves the user, so it qualifies) |

The denial value is the one that function already returns for "not signed in" — three of the ten
are not arrays, so a single copy-pasted `return []` would be a `tsc` failure (review 3, finding 4):

```ts
// clients, integrations, phone-numbers, staff, sidebar-preferences, conversations (list),
// getCallerMessagesForOrg
if (!(await isMfaSatisfiedForUser(supabase, user))) return []
// getConversationNavCounts (inside the existing try, after `if (!user) return empty`)
if (!(await isMfaSatisfiedForUser(supabase, user))) return empty
// getConversationById, getConversationRecordingUrl
if (!(await isMfaSatisfiedForUser(supabase, user))) return null
```

Not covered, deliberately: `lib/data/phone-numbers.ts`'s `getAgentPhoneNumbers` (`:49`) and
`getAgentBlockedNumbers` (`:60`), which resolve no user at all, and the id-taking helpers in
`lib/data/{agents,business,settings,analytics}.ts`. Every one of those is reached from a page or
action that is itself gated by layer 1 or layer 2, so adding a user lookup purely to gate them would
add a round-trip without adding a control.

The existing empty/null return is reused deliberately: it is the file's own established
"not signed in" answer, so no caller contract changes and no caller can forget to handle a new
variant. Ten functions, six files, one import each.

### Residual gap, and what a proxy 307 means for a server-action POST

The inline `getUser()` call sites in the action files under `(dashboard)` / `(settings)` /
`onboarding` are covered by layer 1 only. The verified census is **57 calls across 18 files**:
`(dashboard)/actions/sidebar-preferences.ts` 1, `(dashboard)/actions/voice.ts` 1,
`agents/[id]/actions.ts` **12**, `assistant/actions.ts` 3, `availability/actions.ts` 1,
`booking-page/actions.ts` 2,
`business/actions.ts` 1, `business/knowledge-actions.ts` 1, `calendar/actions.ts` 5,
`clients/actions.ts` 3, `conversations/actions.ts` 6, `integrations/actions.ts` 8,
`integrations/google-calendar-actions.ts` 3, `integrations/microsoft-calendar-actions.ts` 3,
`phone-numbers/actions.ts` 1, `staff/actions.ts` 3, `(settings)/settings/actions.ts` 2,
`onboarding/actions.ts` 1.

`agents/[id]/actions.ts` is the largest single consumer (receptionist create/update/delete, voice
save, agent switching, and two `[]`-returning read helpers), so a shared `requireOrgContext()` has
to cover agent CRUD and the voice-save paths.

Closing them properly means consolidating those per-file `getOrgId` helpers onto a shared
`requireOrgContext()`, which is backlogged (item 1): those files are being edited by concurrent runs
right now, the merge-conflict risk is near-certain, and the duplication is pre-existing rather than
introduced here.

What that costs, stated rather than discovered: when the proxy returns a 307 to `/verify` for a
server-action POST, the client's action fetch follows the redirect and receives an HTML document
where React expects a server-action result. The action does not run — which is the security property
we want — but the client sees a failed action (a rejected promise surfacing as Next's
"unexpected response" error) rather than a clean navigation to `/verify`. That is acceptable because
reaching it requires a pending session on an already-rendered dashboard page, which the navigation
that rendered the page would itself have been redirected to prevent; it is a narrow race (a factor
verified in another tab, or an AAL change mid-session), not a normal path. Layers 2 and 3 return
typed refusals instead, which the existing UIs already render. Improving the client-side experience
of the race is not required by any acceptance criterion and is out of scope.

## The login action

`app/(auth)/actions.ts`, `logIn`:

```ts
const supabase = await createClient()
const { error } = await supabase.auth.signInWithPassword(parsed.data)
if (error) return { error: friendlyAuthError(error.message) }

// A new pending login starts with a clean attempt budget (the counter is per-pending-login).
await clearFailedAttempts()

const mfa = await resolveMfaGate(supabase)
if (mfa.state === 'pending') return redirect(MFA_VERIFY_PATH)
if (mfa.state === 'indeterminate') return endPendingSession(supabase, 'mfa_unavailable')

return redirect(POST_LOGIN_PATH)
```

Unchanged on the no-TOTP path: same error strings, same `redirect('/')`. `satisfied` and
`unauthenticated` fall through to `redirect(POST_LOGIN_PATH)` — correct, because
`signInWithPassword` just succeeded, and a session that is somehow broken is handled by the
layout's own `redirect('/login')`.

**Every terminal branch is written as `return redirect(...)` / `return endPendingSession(...)`, and
that is a requirement, not a style preference.** At runtime `redirect()` throws, so a bare call
would also terminate — but the repo's test mock is
`vi.mock('next/navigation', () => ({ redirect: vi.fn() }))` (`app/(auth)/actions.test.ts:7-9`): a
module-level no-op shared with the `signOutAllDevices` test, which asserts that action *resolves*
normally after calling `redirect`. It therefore cannot be made to throw without breaking an existing
test. Under a non-throwing mock, a bare `redirect(MFA_VERIFY_PATH)` falls through to
`redirect(POST_LOGIN_PATH)`, and the AC2 assertion would pass for an implementation that also sends
a pending user to `/`. Explicit `return` makes the branch terminal under the mock as well as in
production. `redirect()` returns `never` and `endPendingSession` returns `Promise<never>`, so the
declared return types and the narrowing of `mfa` to `{ state: 'pending' }` are unchanged. No call
here sits inside a `try`.

## The OAuth callback

**Decision: OAuth sign-ins are challenged, same as password sign-ins.** Supabase issues an `aal1`
session for OAuth too, and the gate is a property of the session rather than of the credential type,
so the proxy would catch an OAuth user anyway — the only question is whether they get a clean
redirect or bounce off `/` first. Exempting OAuth would be a one-click bypass of the entire feature.
So `app/(auth)/callback/route.ts` picks `/verify` as its destination directly.

The current file builds `NextResponse.redirect(destination)` *before* the session exchange and
rebuilds it inside the `setAll` closure, so `destination` is captured before the assurance level is
knowable. The fix is to collect cookies and headers into locals and build the response once at the
end:

```ts
import type { CookieOptions } from '@supabase/ssr'   // = Partial<SerializeOptions>, types.d.ts:3

const pendingCookies: { name: string; value: string; options?: CookieOptions }[] = []
const pendingHeaders: Record<string, string> = {}

const supabase = createServerClient(url, key, {
  cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (list, headers) => {
      list.forEach(({ name, value }) => request.cookies.set(name, value))
      pendingCookies.push(...list)
      Object.assign(pendingHeaders, headers)
    },
  },
})

const { data, error } = await supabase.auth.exchangeCodeForSession(code)
if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=oauth_failed`)

// ...unchanged member/organization bootstrap, unchanged org_setup_failed early return...

let destination: string = POST_LOGIN_PATH
let isPendingMfa = false
if (isRecovery) {
  destination = '/reset-password'
} else {
  const mfa = await resolveMfaGate(supabase)
  if (mfa.state === 'pending' || mfa.state === 'indeterminate') {
    destination = MFA_VERIFY_PATH
    isPendingMfa = true
  }
}

const response = NextResponse.redirect(`${origin}${destination}`)
for (const c of pendingCookies) response.cookies.set(c.name, c.value, c.options)
for (const [k, v] of Object.entries(pendingHeaders)) response.headers.set(k, v)
if (isPendingMfa) response.cookies.delete(MFA_ATTEMPTS_COOKIE)   // fresh attempt budget
if (isRecovery) response.cookies.set(PASSWORD_RECOVERY_COOKIE, '1', { /* unchanged options */ })
return response
```

The existing early-return error redirects (`missing_code`, `oauth_failed`, `org_setup_failed`), the
deliberate refusal to honor a caller-supplied `next` param, and the open-redirect comment are all
preserved verbatim. The destination stays a fixed internal path chosen by a server-side flag
(requirement 4). `indeterminate` routes to `/verify` here rather than being made terminal, because
the `/verify` page's unavailable panel is the terminal surface and a Route Handler signing the user
out mid-callback would be indistinguishable from a failed OAuth exchange.

**Recovery × TOTP, the edge worth spelling out.** The recovery branch wins, so a TOTP user arriving
from a reset link lands on `/reset-password`, not `/verify`. That is not a bypass: `/reset-password`
is proxy-exempt so the recovery flow is not hijacked (requirement 18 holds), and `updatePassword`
ends with `redirect('/')`, where the proxy sees a still-pending session and sends them to `/verify`.
A reset link gets you a new password, not entry to the app without the code.

## The `/verify` screen

`app/(auth)/verify/page.tsx` plus `app/(auth)/verify/loading.tsx`. No collision: the app has no
existing `/verify`. The path was chosen over `/mfa` or `/two-factor` for being short and sitting
naturally beside `/login` and `/reset-password`. The form component is
`components/auth/verify-code-form.tsx`, next to `login-form.tsx` and `reset-password-form.tsx`.

`/verify` is deliberately **not** registered in `navSections`
(`components/layout/app-sidebar.tsx`). AGENTS.md's rule that new pages get a sidebar entry applies
to authenticated app pages; `/verify` is an unauthenticated auth screen in the `(auth)` group, like
`/login` and `/reset-password`, none of which appear there. `components/layout/app-sidebar.tsx` is
also on this run's do-not-touch list, so the convention and the coordination rule agree. This is a
recorded decision, not an oversight.

The page is an `async` Server Component that resolves the gate and refuses to render a dangling
form:

| Gate state | Behavior |
| --- | --- |
| `pending` | Render the form, showing `mfa.email` as context |
| `satisfied` | `redirect(POST_LOGIN_PATH)` — already verified, nothing to do |
| `unauthenticated` | `redirect('/login')` |
| `indeterminate` | Render the terminal unavailable panel (copy + the cancel form labelled "Sign in again"). No redirect — a Server Component cannot sign out, and bouncing to `/login` with a live pending session is a loop |

This is also what makes the abandoned-flow case land correctly (requirement 10): a user who closes
the tab and comes back has an `aal1` session with a verified factor, so `/` → proxy → `/verify` →
form. Never inside the app, and never silently signed in either.

Markup mirrors `login/page.tsx` and `reset-password/page.tsx`: the `(auth)` layout already supplies
`w-full max-w-xs` and the logo, so the page renders `space-y-8` with a centered
`text-2xl font-semibold` sentence-case heading ("Enter your authentication code"), a
`text-sm text-muted-foreground` line with the email, then the form — the same structure
`reset-password/page.tsx` uses, including its "This link has expired" precedent for the terminal
panel. `export const metadata = { title: 'Enter your authentication code' }`, matching the sibling
pages. `loading.tsx` copies `login/loading.tsx`'s Skeleton-in-Card shape.

**The cancel control, specified exactly.** It is a server-action `<form>` rendered in
`verify/page.tsx` as a **sibling** of `<VerifyCodeForm />`, never inside it — nesting a `<form>`
inside the code form is invalid HTML and breaks submission, and AC7 depends on this control working:

```tsx
<VerifyCodeForm />
<form action={cancelMfaChallenge}>
  <Button type="submit" variant="ghost" className="w-full">
    Use a different account
  </Button>
</form>
```

The same block is reused in the `indeterminate` panel with the label "Sign in again".
`cancelMfaChallenge(): Promise<never>` is assignable to React's form-action type, so no signature
change is needed, and because it is a plain form post it works without JavaScript — which matters
for the one control a stuck user must be able to reach. `variant="ghost"` exists in
`components/ui/button.tsx`.

The `(auth)` group mounts no `ThemeProvider` (confirmed in `app/(auth)/layout.tsx`), so the screen
renders in the default light token set only. The design uses semantic tokens throughout, so nothing
needs a `dark:` variant and nothing breaks if a `ThemeProvider` is added later.

## The verify form

Client component, `components/auth/verify-code-form.tsx`. **Local `useState`, not react-hook-form**
— one OTP field with an auto-submit does not benefit from RHF, the schema is applied directly, and
`input-otp` types `onComplete` as `(...args: any[]) => unknown`, so handing it RHF's `handleSubmit`
would put the OTP value in the event position. This matches the enrollment dialog's
`enrollCode` / `enrollError` state in `app/(settings)/settings/settings-client.tsx:193-194`.

```tsx
const [code, setCode] = useState('')
const [error, setError] = useState<string | null>(null)
const [isSubmitting, setIsSubmitting] = useState(false)

async function submit(value: string) {
  if (isSubmitting) return                        // guards auto-submit racing the button click
  const parsed = totpCodeSchema.safeParse({ code: value })
  if (!parsed.success) {
    setError(parsed.error.issues[0].message)
    return
  }
  setError(null)
  setIsSubmitting(true)
  const result = await verifyMfaChallenge(parsed.data)   // redirects on success
  if (result?.error) {
    setError(result.error)
    setCode('')                                   // never leave a stale code in the boxes
    setIsSubmitting(false)
  }
}
```

```tsx
<form onSubmit={(e) => { e.preventDefault(); void submit(code) }} className="space-y-4">
  <div className="space-y-2">
    <Label htmlFor="code">Authentication code</Label>
    <InputOTP
      maxLength={6}
      id="code"
      value={code}
      onChange={setCode}
      onComplete={(value: string) => void submit(value)}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      disabled={isSubmitting}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={error ? 'code-error' : undefined}
    >
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <InputOTPSlot key={i} index={i} aria-invalid={Boolean(error) || undefined} />
        ))}
      </InputOTPGroup>
    </InputOTP>
    {error && (
      <p id="code-error" role="alert" className="text-sm text-danger">
        {error}
      </p>
    )}
  </div>
  <Button type="submit" className="w-full" disabled={code.length !== 6 || isSubmitting}>
    {isSubmitting ? 'Verifying…' : 'Verify and sign in'}
  </Button>
</form>
```

This is the same `InputOTP` / `InputOTPGroup` / six-`InputOTPSlot` shape as the enrollment dialog,
with accessibility props added — the enrollment dialog passes only `maxLength`, `value`, `onChange`
(`settings-client.tsx:364`), so "identical composition" would be wrong, and an implementer must not
drop the extra props to match it.

How those props land, stated precisely (verified against `input-otp@1.4.2`'s `dist/index.mjs`):
`pattern` is **consumed by `input-otp`**, compiled into an internal `RegExp` that rejects non-digit
keystrokes and pastes, and *also* re-emitted on the real input as `pattern="^\d+$"`
(`regexp.source`). The keystroke filtering, not the HTML attribute, is what this design relies on
(review 3, finding 6). `id`, `inputMode`, `autoComplete`, `disabled`, `autoFocus` and the `aria-*` props
are spread onto the real input (`autoComplete` defaults to `one-time-code` in the library, and
passing it explicitly is harmless and self-documenting). The behavior is what the design wants
either way; only the mechanism differs between `pattern` and the rest.

`REGEXP_ONLY_DIGITS` is exported by the library. The error is inline with `role="alert"` and tied to
the input through `aria-describedby`, so it is both announced and programmatically associated
(requirement 21); a `sonner` toast alone would not satisfy that, which is why this screen renders
errors inline rather than through `toast.error` as `login-form.tsx` does.

`aria-invalid` is set on **both** the input (for assistive tech) and each slot `div` (for the
visual): `InputOTPSlot` carries `aria-invalid:border-destructive`, while `InputOTPGroup`'s
`has-aria-invalid:` only matches descendants and `input-otp` renders the input as a sibling overlay,
so the attribute on the input alone turns nothing red. Focus ring needs nothing extra —
`InputOTPSlot` already has `data-[active=true]:ring-ring/50` and `--ring` is the brand orange
(`#e8490c` light / `#ff6a2b` dark). The slots' `destructive` classes come from the vendored shadcn
primitive and stay as they are; app-level error copy uses `text-danger` per AGENTS.md. No raw
palette classes anywhere.

The cancel control is not part of this component — see "The `/verify` screen".

## The verify and cancel actions

All three new exports live in `app/(auth)/actions.ts`. The helper signatures are pinned because
`verifyMfaChallenge`'s control flow depends on them:

```ts
type PendingSessionEndReason = 'mfa_unavailable' | 'mfa_attempts' | 'mfa_cancelled'

/**
 * Signs out, clears the attempt cookie, redirects to /login?error=<reason>. Never returns.
 * `signOut()` rethrows non-AuthErrors, and this is the one escape path a stuck user has, so the
 * call is wrapped: the redirect must happen either way (review 3, finding 9).
 */
async function endPendingSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reason: PendingSessionEndReason
): Promise<never> {
  try {
    await supabase.auth.signOut()
  } catch {
    // Best effort. The redirect below still strips the user from the app, and the gate keeps
    // denying a session that survives, so this cannot fail open. `logOut` ignores the result too.
  }
  await clearFailedAttempts()
  return redirect(`/login?error=${reason}`)
}

/** Reads fd_mfa_attempts, increments, writes back, returns the new count. NaN is treated as 0. */
async function bumpFailedAttempts(): Promise<number>
async function clearFailedAttempts(): Promise<void>

export async function verifyMfaChallenge(input: TotpCodeInput): Promise<{ error: string }>
export async function cancelMfaChallenge(): Promise<never>
```

`endPendingSession` returning `Promise<never>` is load-bearing: it lets `verifyMfaChallenge` stay
`Promise<{ error: string }>` while `return endPendingSession(...)` typechecks, and it lets
TypeScript narrow `mfa` to `{ state: 'pending' }` after the three guard branches.
`cancelMfaChallenge()` is `endPendingSession(supabase, 'mfa_cancelled')` with its own client.

```ts
export async function verifyMfaChallenge(input: TotpCodeInput): Promise<{ error: string }> {
  const parsed = totpCodeSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const mfa = await resolveMfaGate(supabase)

  if (mfa.state === 'unauthenticated') {
    await clearFailedAttempts()
    return redirect('/login?error=session_expired')
  }
  if (mfa.state === 'satisfied') return redirect(POST_LOGIN_PATH)
  if (mfa.state === 'indeterminate') return endPendingSession(supabase, 'mfa_unavailable')

  const challenge = await supabase.auth.mfa.challenge({ factorId: mfa.factorId })
  if (challenge.error) {
    const mapped = mfaErrorMessage(challenge.error)
    if (mapped.fatal) return endPendingSession(supabase, 'mfa_unavailable')
    return { error: mapped.message }
  }

  const verified = await supabase.auth.mfa.verify({
    factorId: mfa.factorId,
    challengeId: challenge.data.id,
    code: parsed.data.code,
  })

  if (verified.error) {
    const mapped = mfaErrorMessage(verified.error)
    if (mapped.fatal) return endPendingSession(supabase, 'mfa_unavailable')
    if (mapped.throttled) return { error: mapped.message }     // no bump — see "Attempt bound"
    if ((await bumpFailedAttempts()) >= MFA_MAX_ATTEMPTS) {
      return endPendingSession(supabase, 'mfa_attempts')
    }
    return { error: mapped.message }
  }

  await clearFailedAttempts()
  return redirect(POST_LOGIN_PATH)
}
```

Every exit is `return`ed, for the same reason as in `logIn`: under the repo's no-op `redirect` mock,
a bare `redirect('/login?error=session_expired')` would fall through and call
`supabase.auth.mfa.challenge({ factorId: undefined })`, interleaving the "session gone" and "wrong
code" cases and letting a passing test hide a real fall-through. With explicit `return`s each branch
is terminal under the mock and in production alike.

**Challenge then verify, not `challengeAndVerify`.** The enrollment flow uses
`challengeAndVerify()`, and it would work here, but acceptance criterion 3 asks for the two-call
shape and the split buys something real: a `challenge()` failure is distinguishable from a
`verify()` failure, which is how `mfa_factor_not_found` (enrollment deleted mid-flow) gets separated
from `mfa_verification_failed` (wrong code). Both calls happen inside the one action, back to back.

A consequence to be honest about: because a fresh challenge is minted on every submit,
`mfa_challenge_expired` is nearly unreachable in practice — it needs a stalled request or real clock
skew. Requirement 13's "a fresh challenge is issued" half is satisfied structurally rather than by
an explicit re-request button, and the distinct copy still exists for when the server returns that
code.

On success, `mfa.verify()` returns new `aal2` tokens and auth-js writes them through the client's
`setAll`, which lands in the Next cookie store. The `try/catch` in `lib/supabase/server.ts` is a
bare `catch {}` that exists for the Server Component case, where `cookieStore.set` throws; in a
server action the write succeeds, so the redirect carries the elevated session. If it ever were
swallowed, the failure mode is bounded rather than looping: `/` → proxy still sees pending →
`/verify` → the form renders again, because `/verify` is exempt.

### Error mapping

`mfaErrorMessage(error: AuthError)` returns `{ message, fatal, throttled }` — all three fields,
always — and switches on `error.code`, which `AuthError` exposes as a typed
`ErrorCode | (string & {}) | undefined` alongside `status`. All nine codes below exist in auth-js's
`ErrorCode` union. Copy is derived from error conditions, never from `error.message`, matching the
`friendlyAuthError` house style.

| `error.code` | `message` | `fatal` | `throttled` |
| --- | --- | --- | --- |
| `mfa_verification_failed` | That code is not right. Check your authenticator app and try again. | `false` | `false` |
| `mfa_verification_rejected` | That code was rejected. Try the next one from your app. | `false` | `false` |
| `mfa_challenge_expired`, `otp_expired` | That code expired. Enter the current code from your app. | `false` | `false` |
| `over_request_rate_limit` | Too many attempts. Please wait a few minutes and try again. | `false` | **`true`** |
| `mfa_factor_not_found` | Your two-factor setup is no longer available. Please sign in again. | **`true`** | `false` |
| `mfa_ip_address_mismatch` | Your network changed during sign-in. Please sign in again. | **`true`** | `false` |
| `mfa_totp_verify_not_enabled`, `insufficient_aal` | Two-factor sign-in is unavailable right now. Please try again later. | **`true`** | `false` |
| anything else | Could not verify that code. Please try again. | `false` | `false` |

Fallbacks for servers that omit `code`: `status === 429` or `message.includes('rate limit')` maps to
the rate-limit row (`fatal: false`, `throttled: true`), consistent with the existing
`friendlyAuthError`. `fatal: true` ends the pending session rather than retrying, which is the
fail-closed response requirement 16 asks for.

Logging: non-fatal cases are not logged — a mistyped code is not an incident, and logging per
attempt is both noise and a timing-oracle risk. Fatal cases log one line,
`console.error('[auth] mfa challenge unavailable:', error.code)` — code only, never the message or
the user id — matching the single-line `console.error` style already in `requestPasswordReset`.

### Attempt bound

Requirement 14 needs a bound and names none; this design uses **5** failures, matching requirements
assumption 4. It is tracked in an `httpOnly` cookie, `fd_mfa_attempts`, modelled on the
`fd_password_recovery` cookie. The attributes are pinned in one place next to the other constants
in `lib/auth/mfa.ts` so an implementer has nothing to guess (review 3, finding 2):

```ts
export const MFA_ATTEMPTS_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MFA_ATTEMPTS_MAX_AGE_SECONDS,
} as const
```

`bumpFailedAttempts` and `clearFailedAttempts` both use it (clear via `cookieStore.delete(name)`).
`secure` comes from `NODE_ENV` because both run inside a server action with no `NextRequest` in
scope; `app/(auth)/callback/route.ts` keeps its request-derived
`secure: request.nextUrl.protocol === 'https:'` for `fd_password_recovery`, where a request object
is available. Getting this wrong fails quietly rather than loudly — `secure: true` on
`http://localhost:3000` makes the browser drop the cookie, so the counter would read as 0 forever
and the five-failure sign-out would never fire in dev.

The counter is **per-pending-login, not per-browser**. It is cleared when a new pending login
begins (`logIn` after a successful `signInWithPassword`; the OAuth callback's pending branch deletes
it on the response) as well as on success and inside `endPendingSession`. Without that, a user who
failed four times, navigated to `/login`, and signed in again would be signed out on the first
mistyped digit of the new flow — and on a shared browser the count would carry across accounts.

`over_request_rate_limit` does **not** increment the counter (`throttled: true`). Supabase's own
throttling is not the user failing; bumping it would let "wait a few minutes and try again" be
followed immediately by a forced sign-out, which reads as contradictory.

Stated limitation: the client can delete the cookie and reset the counter. That is acceptable and is
exactly the shape requirement 14 describes — Supabase's own `over_request_rate_limit` on
`mfa.verify` is the control that actually bounds brute force; this counter is defense in depth and a
UX affordance that ends a clearly-failing flow. What it must *not* do is grant access, and it
cannot: access is decided entirely by the server-validated token's `aal` claim plus the server's
factor list. Clearing or forging the cookie changes neither.

The pending state itself deliberately does **not** use a cookie marker, which is where this design
diverges from the `fd_password_recovery` precedent. A cookie the client can clear would be a bypass
the moment the gate depended on its presence. The gate depends only on session facts the client
cannot forge.

## Validation

Additive to `lib/validations/auth.ts` (the file that already holds the other auth schemas, not a new
one):

```ts
export const totpCodeSchema = z.object({
  code: z
    .string({ required_error: 'Enter the 6-digit code from your authenticator app' })
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
})

export type TotpCodeInput = z.infer<typeof totpCodeSchema>
```

The installed `zod` resolves to 3.25.76, the classic v3 API, where `.trim()` returns a `ZodString`,
so chaining `.regex()` after it is valid and whitespace is stripped before the pattern check.
Required, string, exactly 6, digits only. One message for every shape of bad input — too short, too
long, non-numeric, empty — deliberately: differentiating them tells an attacker nothing useful and
reads worse for the user who simply mistyped. `safeParse` failure returns
`{ error: issues[0].message }`, the shape every other auth action uses, and returns before any
Supabase call. The client form runs the same schema, so client and server agree by construction.

## `login/page.tsx` notices

`app/(auth)/login/page.tsx` ignores `searchParams` today, so the `?error=missing_code`,
`oauth_failed`, and `org_setup_failed` redirects the callback already issues are silently dropped.
This design adds `mfa_unavailable`, `mfa_attempts`, `mfa_cancelled`, and `session_expired`; without
a reader the user gets dumped at `/login` with no explanation, which would make requirement 14's
friendly message invisible. The page becomes `async`, awaits `searchParams`, and renders a
known-code lookup (unknown codes render nothing) above the form:

```ts
const LOGIN_NOTICES = {
  missing_code:    { tone: 'danger',  text: 'That sign-in link was incomplete. Try again.' },
  oauth_failed:    { tone: 'danger',  text: 'Google sign-in did not complete. Try again.' },
  org_setup_failed:{ tone: 'danger',  text: 'We could not finish setting up your account. Contact support.' },
  mfa_unavailable: { tone: 'danger',  text: 'Two-factor sign-in is unavailable right now. Please try again later.' },
  mfa_attempts:    { tone: 'danger',  text: 'Too many incorrect codes. Sign in again to get a new code prompt.' },
  session_expired: { tone: 'danger',  text: 'Your sign-in session expired. Please sign in again.' },
  mfa_cancelled:   { tone: 'neutral', text: "You're signed out. Sign in to continue." },
} as const
```

`danger` renders `bg-danger-subtle text-danger`, `neutral` renders `bg-muted text-muted-foreground`.
Cancelling is a deliberate user action, not an error, so it gets the neutral tone.
The subset relation is *enforced*, not merely asserted (review 3, finding 10): `actions.ts` exports
`PendingSessionEndReason`, and the map is declared
`as const satisfies Record<LoginNoticeCode, { tone: 'danger' | 'neutral'; text: string }>` with
`type LoginNoticeCode = PendingSessionEndReason | 'session_expired' | 'missing_code' |
'oauth_failed' | 'org_setup_failed'`, so adding a reason without a notice is a typecheck error. The existing
`metadata`, `GoogleButton`, `Separator`, `LoginForm`, and sign-up link all stay as they are.

## Files touched

| File | Change |
| --- | --- |
| `lib/auth/mfa.ts` | New. Gate resolution, exempt-path predicate, error mapping, constants |
| `lib/auth/mfa.test.ts` | New. Unit tests incl. the cookie-tampering and rejection cases |
| `lib/validations/auth.ts` | Additive: `totpCodeSchema`, `TotpCodeInput` |
| `lib/validations/auth.test.ts` | Additive: schema cases |
| `lib/supabase/middleware.ts` | `updateSession` returns `{ response, mfa, authHeaders }`; its `getUser()` becomes the gate call; captures `setAll`'s headers |
| `proxy.ts` | Redirect pending/indeterminate sessions on non-exempt paths, carrying refreshed cookies and no-store headers |
| `proxy.test.ts` | New. Proxy-level gate tests + matcher assertions |
| `app/(auth)/actions.ts` | `logIn` gate branches; new `verifyMfaChallenge`, `cancelMfaChallenge`, internal `endPendingSession`, `bumpFailedAttempts`, `clearFailedAttempts` |
| `app/(auth)/actions.test.ts` | Additive cases |
| `app/(auth)/callback/route.ts` | Deferred response construction; `/verify` destination for pending OAuth; attempt-cookie reset |
| `app/(auth)/callback/route.test.ts` | New |
| `app/(auth)/verify/page.tsx` | New. Gate-state switch, form, cancel form |
| `app/(auth)/verify/loading.tsx` | New |
| `app/(auth)/login/page.tsx` | Render the `?error=` notices |
| `components/auth/verify-code-form.tsx` | New |
| `lib/data/organization.ts` | `getCurrentOrgAndUser` returns null unless the gate is satisfied |
| `lib/data/organization.test.ts` | New |
| `lib/data/{clients,conversations,integrations,phone-numbers,staff,sidebar-preferences}.ts` | Layer 3: deny a pending session (two lines per function, 10 functions) |
| `app/(dashboard)/analytics/actions.test.ts` | New. Org-scoped server action refuses a pending session (AC6) |
| `developer-docs/ARCHITECTURE.md` | Auth Flow lines |

Untouched, per the coordination rules: `developer-docs/TODO.md`, `README.md`, `package.json`,
`playwright.config.ts`, `vitest.config.ts`, `components/layout/app-sidebar.tsx`, the header
notification popover, `lib/voice/**`, `workers/**`, `lib/queue/**`, `lib/email/**`, and
`lib/data/booking-service.ts`. Files outside the requirements' stated scope are enumerated in
"Requirements deviations" below for veto.

## Error handling summary

| Operation | Failure | Recoverable | Caller receives | Logged |
| --- | --- | --- | --- | --- |
| `signInWithPassword` | bad credentials, rate limit | yes | existing `friendlyAuthError` copy, unchanged | no |
| `resolveMfaGate` → `getUser` | `{ error }` or null user | n/a | `unauthenticated` → deny | no |
| `resolveMfaGate` → `getUser` | **throws** (fetch/abort, non-`AuthError`) | n/a | caught in the module → `unauthenticated` → deny | no |
| `resolveMfaGateForUser` → factor list | present but not an array | no | `indeterminate` → deny | no |
| `resolveMfaGateForUser` → AAL | `{ error }` or null `data` | no | `indeterminate` → deny | no |
| `resolveMfaGateForUser` → AAL | **throws** (`AuthInvalidJwtError`, missing `session.user`) | no | caught in the module → `indeterminate` → deny | no |
| `resolveMfaGateForUser` → factor pick | a verified factor exists but none is TOTP | no | `indeterminate` → deny | no |
| `logIn` / `verifyMfaChallenge` with `indeterminate` | AAL unknowable | no | signed out → `/login?error=mfa_unavailable` | once |
| proxy sees `indeterminate` | AAL unknowable | no | 307 → `/verify` → terminal panel + "Sign in again" | no |
| `mfa.challenge` | factor gone, rate limit | depends on `fatal` | mapped copy, or signed out | fatal only |
| `mfa.verify` | wrong or expired code | yes | mapped copy, stays on `/verify`, counter bumped | no |
| `mfa.verify` | `over_request_rate_limit` | yes | "too many attempts" copy, counter **not** bumped | no |
| `mfa.verify` | 5th counted failure | no | signed out → `/login?error=mfa_attempts` | no |
| `verifyMfaChallenge` with no session | session gone | no | `return redirect('/login?error=session_expired')` | no |
| `totpCodeSchema` | bad shape | yes | field message, no Supabase call | no |
| `exchangeCodeForSession` | invalid code | no | `/login?error=oauth_failed`, unchanged | no |

Note what is **not** in this table: a row saying "an unhandled throw in `proxy()` yields a Next 500,
which is still closed". That argument is withdrawn. `lib/auth/mfa.ts` never rejects, so the gate
cannot 500 a request — which matters because `resolveMfaGate` runs inside `updateSession` *before*
`isMfaExemptPath` is consulted, so a throwing gate would have failed `/login` and `/verify` too and
left the pending user with no way to end the session. Failing closed and failing *usefully* are
different properties, and the design now has both.

## Invariant ownership

| Invariant | Owner | Why there |
| --- | --- | --- |
| A pending session renders no protected content | `proxy.ts` (primary) + `getCurrentOrgAndUser` + the ten data helpers | The proxy covers navigations, RSC requests, and server-action POSTs uniformly; the data layers survive a matcher change |
| The assurance decision is not client-forgeable | `lib/auth/mfa.ts`, via the documented precondition that `user` comes from a `getUser()` on the same client | `getUser()` validates the access token server-side; the `aal` claim is then trustworthy for *that* token, and cookie `user.factors` is never consulted |
| The gate never rejects | `lib/auth/mfa.ts` — both Supabase calls wrapped | A throw inside `proxy()` would 500 the exempt escape routes as well as the protected ones |
| The challenged factor belongs to the user and is a TOTP factor | `lib/auth/mfa.ts` — `factorId` from the server's factor list, `factor_type === 'totp'` chosen at step 5 | Never accepts a client-supplied factor id; never challenges a factor type this app has no screen for |
| Code shape | `lib/validations/auth.ts` | Repo convention: schemas in `lib/validations`, enforced server-side before any Supabase call |
| An abandoned flow never becomes a session | the gate being session-derived, plus `/verify`'s own state check | Nothing to expire or clean up: an `aal1` session with a verified factor is pending until verified or signed out |
| A pending session can always escape | `/verify` is exempt and hosts the `cancelMfaChallenge` form | The only sign-out affordance a pending session can reach, by design, and it works without JavaScript |

## Bypass analysis

| Path | Outcome | Covered by |
| --- | --- | --- |
| Direct URL to `/`, `/settings`, `/onboarding`, `/analytics` | 307 → `/verify` | `proxy.test.ts` |
| Server-action POST to a dashboard/settings route (POST + `Next-Action` header) | 307 from the proxy; the action never runs | `proxy.test.ts`, one case per owning route group |
| Org-scoped action reached through `getCurrentOrgAndUser` | `{ error: 'You must be signed in…' }` | `app/(dashboard)/analytics/actions.test.ts` |
| Org-scoped read through a shared data helper | empty result | `lib/data/organization.test.ts` + layer-3 cases |
| Server Component data fetch in a dashboard layout | context null → `redirect('/login')` | `lib/data/organization.test.ts` |
| **Session cookie edited to delete `user.factors`** | still pending — factors come from `getUser()`, `nextLevel` is never read | `lib/auth/mfa.test.ts` |
| **Session cookie edited to claim `aal2`** | `getUser()` rejects the forged token → `unauthenticated` → deny | `lib/auth/mfa.test.ts` (getUser error → unauthenticated) |
| **Session cookie truncated so `decodeJWT` throws** | caught → `indeterminate` → deny, and the exempt screens still render | `lib/auth/mfa.test.ts` (AAL rejects → indeterminate) |
| `user.factors` returned as a non-array | `indeterminate` → deny | `lib/auth/mfa.test.ts` |
| Verified non-TOTP factor only, `aal1` | `indeterminate` → deny (no SMS is ever sent) | `lib/auth/mfa.test.ts` |
| `fd_mfa_attempts` cleared or forged | counter resets; grants nothing | by construction — not an input to the gate |
| Abandon at `/verify`, return later | `/` → `/verify`, form again, never inside the app | `proxy.test.ts` + verify page test |
| OAuth sign-in with TOTP enrolled | the callback sends `/verify`; the proxy would catch it regardless | `app/(auth)/callback/route.test.ts` |
| Reset-link login by a TOTP user | `/reset-password` works, then `/` → `/verify` | callback + proxy tests |
| AAL read failure | `indeterminate` → signed out with copy, or terminal panel | `lib/auth/mfa.test.ts`, `app/(auth)/actions.test.ts` |
| New route added later | gated by default — the exempt list is an allowlist | `isMfaExemptPath` tests |
| Action file with its own inline `getUser()` (57 calls, 18 files) | gated by the proxy only; residual gap, backlogged | `proxy.test.ts` route cases |
| Pre-gate `getAgentById` read in `agents/[id]/page.tsx` (line 19, before the layer-2 call at 20) | nothing renders; layer 1 prevents reaching the route | `proxy.test.ts` (`/agents/abc`) |
| `/api/assistant`, `/api/conversations/[id]/recording` | gated (not exempt) | `isMfaExemptPath` tests |

## Testability

Almost all coverage is unit-level, because every decision point takes its dependencies as
parameters.

`resolveMfaGate` / `resolveMfaGateForUser` / `isMfaSatisfiedForUser` accept a client, so tests pass
a literal `{ auth: { getUser, mfa: { getAuthenticatorAssuranceLevel } } }` — the same
`vi.mocked(createClient).mockResolvedValue({...} as never)` pattern as
`app/(settings)/settings/actions.test.ts`'s `mockMfaSupabase` helper. Rejections are exercised with
`vi.fn().mockRejectedValue(new Error('boom'))`. `isMfaExemptPath` and `totpCodeSchema` are pure.

The actions are tested by mocking `@/lib/supabase/server` and `next/navigation` exactly as
`app/(auth)/actions.test.ts` already does, with its `cookieStore = { has, delete }` mock extended
with `get` and `set` for the attempt counter. **The `redirect` mock stays a non-throwing
`vi.fn()`** — the existing `signOutAllDevices` test depends on it resolving — which is why the
actions use explicit `return redirect(...)`, and why the new assertions must be ordinal rather than
mere "was called with" checks:

- `expect(redirect).toHaveBeenNthCalledWith(1, '/verify')` **and**
  `expect(redirect).toHaveBeenCalledTimes(1)`, so an implementation that also falls through to `/`
  fails.
- On every non-`pending` branch of `verifyMfaChallenge`, additionally
  `expect(challenge).not.toHaveBeenCalled()`, so a fall-through into
  `mfa.challenge({ factorId: undefined })` fails.
- On the no-factor `logIn` path, `expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled()`,
  which is the structural proof that requirement 2's "no extra work for non-TOTP users" holds.

`proxy.test.ts` mocks `@/lib/supabase/middleware` to return a chosen `mfa` state plus a
`NextResponse` carrying a cookie and an `authHeaders` map, constructs a real `NextRequest`, and
asserts on `response.status`, `response.headers.get('location')`, that the cookie survived onto the
redirect, and that `Cache-Control: ...no-store...` is present. Matcher assertions use
**`unstable_doesMiddlewareMatch({ config, url })`** from `next/experimental/testing/server` — the
helper keeps the `middleware` name in Next 16.4 even though the file convention is `proxy.ts`
(verified in `node_modules/next/dist/experimental/testing/server/middleware-testing-utils.d.ts`;
there is no `unstable_doesProxyMatch`). Do not "correct" the name.

`proxy.test.ts` and `app/(auth)/callback/route.test.ts` are the first tests in the repo to
construct Next server primitives, and `vitest.config.ts` sets `environment: 'jsdom'` globally with
no per-directory override and is out of scope for this run. Both files therefore open with a
per-file docblock (review 3, finding 3):

```ts
// @vitest-environment node
import { NextRequest } from 'next/server'
```

`lib/auth/mfa.test.ts`, `app/(auth)/actions.test.ts`, `lib/data/organization.test.ts`,
`app/(dashboard)/analytics/actions.test.ts`, and `lib/validations/auth.test.ts` touch no Next
server primitives and stay on the default jsdom environment.

Test inventory, mapped to acceptance criteria:

| Test | Asserts | AC |
| --- | --- | --- |
| `actions.test.ts` — `logIn`, no factors | `getAuthenticatorAssuranceLevel` never called, `redirect` called once with `'/'` | 1 |
| `actions.test.ts` — `logIn`, verified factor + `aal1` | `redirect` nth(1) `'/verify'`, called once | 2 |
| `actions.test.ts` — `logIn`, `indeterminate` | `signOut()` called, `redirect` nth(1) `'/login?error=mfa_unavailable'`, called once | — (review 1, finding 2) |
| `actions.test.ts` — `verifyMfaChallenge` success | `challenge({ factorId })` then `verify({ factorId, challengeId, code })`, `redirect` nth(1) `'/'` | 3 |
| `actions.test.ts` — wrong code | returns mapped copy, `redirect` never called, counter bumped | 4 |
| `actions.test.ts` — `verifyMfaChallenge`, `unauthenticated` | `redirect` nth(1) `'/login?error=session_expired'`, `challenge` never called | 4 |
| `actions.test.ts` — `over_request_rate_limit` | friendly copy, counter **not** bumped | 10 |
| `actions.test.ts` — 5th counted failure | `signOut()`, `redirect` nth(1) `'/login?error=mfa_attempts'` | 10 |
| `actions.test.ts` — `mfa_challenge_expired` | copy distinct from the wrong-code copy | 11 |
| `actions.test.ts` — `mfa_factor_not_found` | fatal: signed out, `verify` not retried | 16 |
| `actions.test.ts` — `cancelMfaChallenge` | `signOut()`, `fd_mfa_attempts` deleted, `redirect` nth(1) `'/login?error=mfa_cancelled'` | 7 |
| `actions.test.ts` — `logIn` clears the counter | `clearFailedAttempts` on a fresh pending login | — (review 1, finding 8) |
| `proxy.test.ts` — pending + `/`, `/settings`, `/onboarding` | 307 → `/verify`, cookies and no-store headers preserved | 5, 8 |
| `proxy.test.ts` — pending + POST with `Next-Action` to a dashboard and a settings route | 307 → `/verify` | 5, 6 |
| `proxy.test.ts` — pending + `/verify`, `/login`, `/smb/x`, `/manifest.webmanifest` | passes through | 7, 9 |
| `proxy.test.ts` — satisfied / unauthenticated | pass through unchanged | 1 |
| `proxy.test.ts` — matcher | `unstable_doesMiddlewareMatch` true for `/`, false for `/_next/static/chunk.js` | 5 |
| `lib/auth/mfa.test.ts` | all gate branches; deleted-`factors` tamper case; non-array `factors`; verified-non-TOTP-only → indeterminate; `aal2` + non-TOTP factor → satisfied; `getUser` `{ error }` → unauthenticated; **`getUser` rejects → unauthenticated**; **AAL rejects → indeterminate**; AAL `{ error }` / null data → indeterminate; exempt-path boundaries incl. `/verify-email` not exempt | 14 |
| `lib/data/organization.test.ts` | pending → `null`; indeterminate → `null`; satisfied → context | 5, 6, 8 |
| `app/(dashboard)/analytics/actions.test.ts` | pending session → `{ error: 'You must be signed in to view analytics.' }` | 6 |
| `lib/validations/auth.test.ts` | empty, 5-digit, 7-digit, non-numeric, whitespace-padded | 9 |
| `app/(auth)/callback/route.test.ts` | OAuth + verified factor → `/verify`; recovery → `/reset-password` with the cookie; no-factor OAuth → `/` | 12 |

The two rejection cases in `lib/auth/mfa.test.ts` are the direct test of the "never rejects"
contract: `await expect(resolveMfaGate(client)).resolves.toEqual({ state: 'unauthenticated' })` with
a rejecting `getUser`, and `… .resolves.toEqual({ state: 'indeterminate' })` with a rejecting AAL
call.

Integration-level, listed rather than claimed: that Supabase emits `aal1`/`aal2` in the `aal` claim
under this project's signing-key configuration, that OAuth sessions are issued at `aal1`, that
`mfa.verify()`'s cookie write survives a full server-action round trip in a running server, and that
`getAuthenticatorAssuranceLevel()` adds no measurable round-trip (NFR 26). These need a live
Supabase project, and Playwright is out of scope (`playwright.config.ts` is owned by a concurrent
run), so they are verified manually against `pnpm dev` with a real authenticator — enroll in
settings, sign out, sign in, confirm the `/verify` redirect, verify, confirm the dashboard loads,
then repeat through Google sign-in — and written up in the final report.

## Verification procedure

1. `pnpm install --frozen-lockfile` **inside the worktree** — it has no `node_modules`, so `pnpm
   exec tsc`, `pnpm exec eslint`, `pnpm test`, and `pnpm dev` all fail there until this runs. If
   tests fail for a missing env var, copy `.env.local` from the main checkout (never print values).
2. **Re-check the three version-sensitive facts after install.** `@supabase/ssr` and
   `@supabase/supabase-js` are pinned to `"latest"` in `package.json` (which this run must not
   edit), and every package claim here was verified against `@supabase/ssr@0.12.4` /
   `@supabase/auth-js@2.112.2` in the main checkout. Confirm (a) `SetAllCookies` still takes the
   `headers` argument — otherwise use the `AUTH_NO_STORE_HEADERS` fallback above, (b)
   `_getAuthenticatorAssuranceLevel` still derives `nextLevel` from `session.user.factors`, since
   the whole threat model rests on it, and (c) its no-argument branch is still unwrapped, which is
   what makes the try/catch load-bearing rather than defensive. If a future version reads the factor
   list server-side, the design still holds (we never read `nextLevel`), but the rationale comment
   should be updated.
3. Run vitest **from inside the worktree**, not the main checkout: `vitest.config.ts` excludes
   `**/.claude/worktrees/**`, not `**/.worktrees/**`, so a run from the main checkout collects this
   worktree's tests too and double-counts the failure baseline. (Fixing that exclude is backlog
   item 5 — `vitest.config.ts` is shared config and out of scope here.)
4. **Measure the baseline before claiming anything.** The brief cites 10 failures across 4 files
   (`app/smb/actions.test.ts`, `lib/data/analytics.test.ts`, `lib/data/availability-engine.test.ts`,
   `lib/voice/adapters/fish-audio-tts.test.ts`) while `AGENTS.md` records 3 files as of 2026-10-08.
   This run validates against a freshly measured baseline: run the full suite on the branch point
   before the first edit, record the count, and compare at the end. Report both numbers.
5. `pnpm exec tsc --noEmit` clean. `pnpm exec eslint` on changed files only (full-repo `pnpm lint`
   carries 29 pre-existing errors and is not a gate).
6. Manual pass for the integration-level facts in the previous section.

## Documentation

`developer-docs/ARCHITECTURE.md`, Auth Flow section. Line 97 currently reads:

> - Supabase Auth handles signup/login (email + Google OAuth), plus TOTP two-factor via
>   `supabase.auth.mfa.*` (enrolled in settings; login-time AAL2 challenge not yet enforced — see
>   `TODO.md`)

It is replaced verbatim with:

> - Supabase Auth handles signup/login (email + Google OAuth), plus TOTP two-factor via
>   `supabase.auth.mfa.*` (enrolled in settings and enforced at login: a session holding a verified
>   factor but no `aal2` claim is redirected to `/verify`)

The `TODO.md` pointer goes with it — the root `TODO.md` is being deleted by the orchestrator this
run, so keeping the reference would dangle, and AC15 asks the line to describe the gate rather than
point elsewhere.

Three bullets are added after it:

- The `/verify` challenge screen: `mfa.challenge()` + `mfa.verify()` in `verifyMfaChallenge`, with
  `cancelMfaChallenge` as the escape hatch.
- The definition of "pending MFA": a verified TOTP factor from `getUser()` (never the session
  cookie, whose `user` object is unsigned) plus an `aal` claim that is not `aal2`. Resolved in
  `lib/auth/mfa.ts`.
- Where it is enforced: `proxy.ts` for every non-exempt path, `getCurrentOrgAndUser()` for Server
  Components and the actions that use it, and the shared `lib/data` read helpers.

The existing line 100 (`proxy.ts` / `updateSession`) is updated because `updateSession` now returns
`{ response, mfa, authHeaders }` instead of a response. Line 99 (password recovery) is unchanged.

`developer-docs/TODO.md` and `README.md` are left untouched per the coordination rules; the final
report carries the two-to-three-sentence summary the orchestrator needs to mark "Enforce TOTP at
login" / "Enforce two-factor at login" done.

## Backlog

1. **Consolidate the per-file `getOrgId` helpers onto a shared `requireOrgContext()`.** The right
   permanent fix for the residual server-action gap (17 action files, 45 inline `getUser()` calls,
   enumerated above), and it would remove a lot of duplication. Deferred because those files are
   being edited by concurrent runs — near-certain merge conflicts, and the security benefit over the
   proxy layer is incremental. `lib/auth/mfa.ts` is the ready-made building block.
2. **Recovery codes.** Out of scope per requirements; a lost authenticator still means manual
   recovery. Worth doing next, since enforcement turns a lost phone into a hard lockout.
3. **Intended-destination capture.** The post-login destination stays `/`. Nothing captures an
   intended path today, so the proxy's redirect to `/verify` loses the originally requested URL.
   Adding it needs internal-relative validation and is not required by any acceptance criterion.
4. **Server-side attempt counter.** The cookie counter is clearable. A durable per-user counter
   needs a table and a migration, outside this run's scope, and Supabase's own rate limiting already
   provides the real bound.
5. **`vitest.config.ts` exclude.** It excludes `**/.claude/worktrees/**` but not `**/.worktrees/**`,
   so a main-checkout test run collects worktree trees. One-line fix, but shared config owned by no
   one this run — flagged for the orchestrator.
6. **Pin `@supabase/ssr` and `@supabase/supabase-js`.** Both are `"latest"`, which means a reinstall
   can change auth-client internals this feature's threat model depends on. `package.json` is
   off-limits this run.
7. **Non-TOTP factor types.** A verified non-TOTP factor on an `aal1` session is refused
   (`indeterminate`) rather than challenged, because there is no screen for it. If phone factors are
   ever enabled, step 5 of `resolveMfaGateForUser` needs a per-type challenge route.

## Requirements deviations

Four deliberate departures. Each is flagged here so the reviewer can veto rather than discover it in
the diff.

1. **Assumption 6 is wrong.** `getCurrentOrgAndUser` is not the server-side chokepoint — 60
   `getUser()` call sites across 28 non-test files, with per-file helpers in 17 action files (45
   calls). The design gates `getCurrentOrgAndUser` (every Server Component and a real org-scoped
   action), adds layer 3 across the ten shared `lib/data` read helpers, and relies on the proxy for
   the inline-`getUser()` action files. The residual gap and its client-side consequence are stated
   above and backlogged.
2. **`nextLevel` is never read**, although requirement 1 and AC2 are phrased in terms of
   `currentLevel: 'aal1'` + `nextLevel: 'aal2'`. Reason: `nextLevel` is derived from unsigned cookie
   `user.factors`, so trusting it is a one-cookie-edit bypass. The observable behavior matches the
   requirement; the computation is stricter.
3. **Scope is wider than the requirements' file list.** Beyond `app/(auth)/**`, `proxy.ts`, the new
   screen, `lib/validations/**`, and the `ARCHITECTURE.md` Auth Flow line, this design edits:
   - `lib/supabase/middleware.ts` — the proxy cannot see the user without it.
   - `lib/data/organization.ts` (+ new `lib/data/organization.test.ts`) — nothing server-side
     enforces anything without it.
   - `components/auth/verify-code-form.tsx` (new) — repo convention puts auth forms here.
   - `lib/data/{clients,conversations,integrations,phone-numbers,staff,sidebar-preferences}.ts` —
     layer 3, two lines per function. **Highest conflict risk of the set**; if a concurrent run has
     already rewritten one of these, drop that file's edit and record it rather than fighting the
     merge. The proxy still covers those paths.
   - `app/(dashboard)/analytics/actions.test.ts` (new) — the only org-scoped action that already
     routes through `getCurrentOrgAndUser`, so it is where AC6 is literally demonstrable. A new file
     in a contended route group; conflicts only if a concurrent run creates the same path.

   None of these appears in the brief's explicit do-not-touch list.
   `app/(auth)/login/page.tsx` is in scope under `app/(auth)/**`, and
   `components/layout/app-sidebar.tsx` is explicitly *not* edited (see "The `/verify` screen").
4. **Docs:** per assumption 1 in the requirements, only `ARCHITECTURE.md` is edited;
   `developer-docs/TODO.md` and `README.md` are left to the orchestrator even though the brief's
   "Docs to update" section lists them.

---

## Responses to design review findings (review 2)

Review 2 raised 0 HIGH, 3 MEDIUM, 8 NIT. All eleven are addressed; none is backlogged or ignored.
Review 1's findings were addressed in revision 2 and that response log is dropped here to keep this
document readable — the body above is the current design, and review 2 confirmed revision 1's two
HIGH findings as genuinely fixed.

### MEDIUM

**1 — `mfaErrorMessage`'s declared return type omitted `throttled`. Addressed as suggested.** The
export list now declares
`mfaErrorMessage(error: AuthError): { message: string; fatal: boolean; throttled: boolean }`, with a
sentence stating that all three fields are always present and why (`verifyMfaChallenge` reads
`mapped.throttled`, so a two-field declaration is a typecheck error under NFR 27). The mapping table
now sets all three fields explicitly in every row — the old table used a blank-ish `no`/`yes`
notation that left the third column implicit — and the `status === 429` fallback states both
`fatal: false` and `throttled: true`.

**2 — The gate assumed its two Supabase calls never throw. Addressed as suggested, and promoted to a
module contract.** I re-verified the finding in
`@supabase/auth-js@2.112.2/dist/main/GoTrueClient.js`: the no-argument AAL branch at `:5038-5060`
calls `decodeJWT(session.access_token)` and dereferences `session.user.factors` with no try/catch
(only the `jwt` branch at `:5014-5037` is wrapped), and `_getUser` rethrows non-`AuthError`s at
`:2704-2715`. `lib/auth/mfa.ts` now opens with an explicit "no exported function in this file ever
rejects" contract; step 3 wraps the AAL read in `try/catch` returning `{ state: 'indeterminate' }`,
and `resolveMfaGate` wraps `getUser()` returning `{ state: 'unauthenticated' }`. A new subsection,
"The two calls can throw", records the source evidence so the wrappers are not mistaken for
defensive noise and removed later. Two `lib/auth/mfa.test.ts` cases are in the inventory (AAL
rejects → `indeterminate`; `getUser` rejects → `unauthenticated`) with the exact
`.resolves.toEqual(...)` assertions spelled out. The error-handling table gained three rows for the
throw paths and **lost** the row that appealed to a Next 500; a short note now states why that
argument was withdrawn — a throwing gate would have failed `/login` and `/verify` as well, since
`resolveMfaGate` runs before `isMfaExemptPath` is consulted.

I also verified an adjacent detail while in that source and recorded it: with no session at all the
AAL call returns `{ currentLevel: null, nextLevel: null }` and `error: null` (`:5044-5049`), so it is
the `currentLevel === null` → pending mapping, not the error mapping, that keeps that case closed.

**3 — Control flow relied on `redirect()` throwing while the reused mock is a no-op. Addressed as
suggested.** Every terminal branch in `logIn` and `verifyMfaChallenge` is now written as
`return redirect(...)` / `return endPendingSession(...)`, and both action sections explain that this
is a correctness requirement under the repo's non-throwing `vi.fn()` mock rather than a style
choice — including why the mock cannot simply be made to throw (`signOutAllDevices`'s existing test
asserts the action resolves after calling `redirect`). Testability now specifies ordinal assertions:
`toHaveBeenNthCalledWith(1, '/verify')` plus `toHaveBeenCalledTimes(1)`, and
`expect(challenge).not.toHaveBeenCalled()` on every non-`pending` branch of `verifyMfaChallenge`.
The inventory rows were rewritten to those assertions, and a `verifyMfaChallenge` +
`unauthenticated` row was added since that was the specific interleaving the finding named.

### NIT

**4 — Layer 3's reach was overstated. Addressed as suggested.** The section now leads with the rule
("exactly the shared `lib/data` read helpers that resolve the caller themselves") and names all ten
functions with verified line numbers in the worktree, then names what is *not* covered —
`getAgentPhoneNumbers` (`:49`) and `getAgentBlockedNumbers` (`:60`), which resolve no user, and the
id-taking helpers in `lib/data/{agents,business,settings,analytics}.ts` — with the reason they are
reached only through an already-gated page or action. `getHiddenSidebarItems` is kept in the covered
set with a note that it takes an org id *and* resolves the user, so it qualifies under the rule.

**5 — The inline-`getUser()` census was off. Addressed, with a different number than the review's.**
I counted it myself in the worktree rather than adopting either figure, and both the design's
"14 files / ~37" and the review's "12 files / 36" are low: it is **45 calls across 17 files**. The
review's per-directory enumeration misses the secondary action files in the same folders —
`integrations/google-calendar-actions.ts` (3), `integrations/microsoft-calendar-actions.ts` (3),
`business/knowledge-actions.ts` (1), `(dashboard)/actions/sidebar-preferences.ts` (1),
`(dashboard)/actions/voice.ts` (1) — which is exactly 9 calls and 5 files more than 36/12. The full
per-file enumeration is now in the design so backlog item 1 has a definite scope, and the figure is
consistent in all four places it appears. The review's "60 call sites / 28 files" is confirmed (with
test files excluded); its "15 call sites across 14 files" for `getCurrentOrgAndUser` is 15 sites
across **15** files, and the verified consumer list is now in layer 2.

**6 — The `/_next` exemption cited a Pages Router mechanism. Addressed as suggested, verbatim.** The
comment now reads `// build output, image optimizer and dev HMR; RSC payload requests use the page
path and stay gated`.

**7 — The ARCHITECTURE.md edit left a dangling `TODO.md` reference. Addressed as suggested.** The
Documentation section now quotes line 97 as it stands and gives the replacement verbatim, with no
`TODO.md` pointer, plus a sentence on why the pointer goes (the root `TODO.md` is being deleted this
run). The three added bullets and the line-100 update are unchanged.

**8 — The cancel control's invocation was unspecified. Addressed as suggested.** "The `/verify`
screen" now specifies the exact markup — `<form action={cancelMfaChallenge}>` wrapping a
`type="submit"`, `variant="ghost"`, `className="w-full"` button — rendered as a **sibling** of
`<VerifyCodeForm />` in `verify/page.tsx`, never nested, with the invalid-HTML trap named. The same
block is reused in the unavailable panel labelled "Sign in again". I added one point the review did
not: because it is a plain form post it works without JavaScript, which matters for the single
control a stuck user must be able to reach. "The verify form" section ends by stating the cancel
control is not part of that component, so the two sections cannot be read as duplicating it.
`variant="ghost"` confirmed present in `components/ui/button.tsx`.

**9 — `/verify`'s absence from `navSections` was unexplained. Addressed as suggested.** A short
paragraph in "The `/verify` screen" records it as a decision: `/verify` is an unauthenticated auth
screen in the `(auth)` group, like `/login` and `/reset-password`, none of which are registered, and
`components/layout/app-sidebar.tsx` stays untouched. Cross-referenced from deviation 3.

**10 — `factor_type === 'totp'` was narrower than auth-js's verified-factor test. Addressed by
taking the review's first option, not the accepted-risk one.** Step 2 now filters on
`status === 'verified'` alone, matching `GoTrueClient.js:5025` / `:5055`, so a verified non-TOTP
factor can no longer make an `aal1` session look `satisfied` — the fail-open direction NFR 25 rules
out. The factor type is used only at step 5 to pick what to challenge, and when no verified factor
is TOTP the gate returns `indeterminate`, which keeps `mfa.challenge()` from ever sending an SMS and
routes the user to terminal copy instead.

One ordering decision the review did not specify and I had to make: the `currentLevel === 'aal2'`
check runs **before** the TOTP-pick, so an account already elevated to `aal2` is `satisfied`
regardless of factor type. Putting the pick first would have locked out a legitimately elevated
session whose only verified factor is a phone — a fail-*closed* bug, but a lockout nonetheless. The
reasoning is stated in the design, two new `lib/auth/mfa.test.ts` cases cover both directions
(verified-non-TOTP-only + `aal1` → `indeterminate`; `aal2` + non-TOTP factor → `satisfied`), a
bypass-analysis row is added, and backlog item 7 records what step 5 would need if phone factors are
ever enabled.

**11 — `pattern` does not reach the real input. Addressed as suggested, slightly expanded.** "The
verify form" now says `pattern={REGEXP_ONLY_DIGITS}` is consumed by `input-otp` and compiled into an
internal `RegExp` that rejects non-digit keystrokes and pastes, while `id`, `inputMode`,
`autoComplete`, `disabled`, `autoFocus` and the `aria-*` props are spread onto the real input — with
the note that `autoComplete` defaults to `one-time-code` in the library and passing it explicitly is
harmless and self-documenting, so an implementer does not delete it as redundant. The sentence also
states that the delivered behavior is unchanged; only the mechanism differed from the old
explanation.

### On the review's unverified items

All six stay on the manual/verification list, unchanged in substance:

- That this Supabase project emits `aal`/`aal2` claims and issues OAuth sessions at `aal1` — manual
  pass, and fail-closed if the claim is missing (`currentLevel: null` → pending).
- That `mfa.verify()`'s refreshed cookies survive a real server-action round trip — manual pass.
- NFR 26's no-extra-round-trip claim — now explicitly listed as "measurable, therefore manual"
  rather than asserted in the latency section.
- The failure baseline — Verification step 4 measures it on the branch point and reports both
  numbers.
- Which `@supabase/ssr` / `@supabase/supabase-js` versions a worktree install resolves —
  Verification step 2, now with a third item (the AAL branch still being unwrapped) so the new
  try/catch is re-justified rather than silently kept.
- Whether concurrent runs have rewritten the layer-3 helpers or created the analytics test file —
  deviation 3's "drop that file's edit and record it" instruction stands; the proxy covers those
  paths either way.
