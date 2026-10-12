# Design review 3 — enforce TOTP two-factor at login

Reviewing `02-design.md` (revision 3) against `01-requirements.md`, with every claim about existing
code re-checked against the worktree at `e:\Projects\frontdesk-ai\.worktrees\totp-login-challenge`
and against the installed packages in the main checkout (the worktree has no `node_modules`).

**Verdict: CHANGES_REQUESTED** — 0 HIGH, 3 MEDIUM, 7 NIT.

The core of this design holds up. The threat model is correct in detail: I read
`_getAuthenticatorAssuranceLevel`, `_getUser`, `_listFactors` and `decodeJWT` in
`@supabase/auth-js@2.112.2` and the design's reading of all four is accurate, including the
unwrapped no-argument AAL branch that makes the `try/catch` load-bearing. The server-action half of
the proxy argument also checks out at a level the design did not claim: Next 16.4 resolves action
IDs through `workers[normalizeWorkerPageName(workStore.page)]`, so a dashboard action id re-POSTed
to the exempt `/verify` path after a 307 cannot execute — it throws "action not found". The gate's
layering, fail-closed posture, and `nextLevel`-is-never-read decision are all sound.

What blocks is smaller and mostly mechanical: one security-relevant inventory is wrong, one cookie
attribute has no specified source, and the new tests have no specified environment.

---

## Findings

### 1. MEDIUM — The inline-`getUser()` census omits the largest action file; the real numbers are 72/29 and 57/18

**Where:** "Residual gap, and what a proxy 307 means for a server-action POST"; "Enforcement layer 3"
(opening paragraph); "Requirements deviations" item 1; "Bypass analysis" row *Action file with its own
inline `getUser()` (45 calls, 17 files)*; "Backlog" item 1; and the response log's NIT 5, which
asserts the figure against two earlier counts ("it is **45 calls across 17 files**").

The design's per-file enumeration lists 17 files and does not contain
`app/(dashboard)/agents/[id]/actions.ts`, which holds **12** inline `auth.getUser()` calls (lines
59, 109, 323, 371, 408, 458, 544, 603, 627, 752, 834, 861 — receptionist create/update/delete, voice
save, agent switching, and two `[]`-returning read helpers). Counting with `Get-Content -LiteralPath`
over `app/` + `lib/` excluding `*.test.*`:

- **72** `auth.getUser(` calls across **29** non-test files, not "60 across 28".
- Inline action-file subset: **57** calls across **18** files, not "45 across 17".

The cause is a search that silently skips bracketed dynamic-route directories — PowerShell's
`Select-String -Path` and ripgrep-style globs both treat `[id]` as a character class, so
`app\(dashboard)\agents\[id]\actions.ts` and `app\api\conversations\[id]\recording\route.ts` drop out
with no error. I reproduced exactly 60/28 that way before switching to `-LiteralPath`, which is
likely how the design arrived at the same wrong number and then defended it against the previous
review.

Nothing in the enforcement design changes — those calls are proxy-covered either way, and the file
is in `app/`, not `lib/data`, so layer 3's stated rule correctly excludes it. But this is the one
inventory that defines the residual security gap and scopes backlog item 1, the design presents it as
personally verified, and it omits the single biggest contributor.

**Fix.** Replace the three figures and add the file to the enumeration:

```
There are 72 `auth.getUser(` call sites across 29 non-test files under `app/` and `lib/`;
`getCurrentOrgAndUser` backs 16 of them, while the mutating server actions resolve the user
inline in 18 files: ... `agents/[id]/actions.ts` 12, ...  (57 calls total)
```

Update the bypass-analysis row to "(57 calls, 18 files)" and add one sentence to backlog item 1
noting that `agents/[id]/actions.ts` is the largest single consumer, so `requireOrgContext()` must
cover agent CRUD and voice-save paths. When re-counting, use `-LiteralPath` (or `rg --glob`-free
recursion) so `[id]` directories are not skipped.

---

### 2. MEDIUM — `fd_mfa_attempts`'s `secure` attribute has no specified source in a server-action context, and getting it wrong silently disables the attempt bound

**Where:** "Attempt bound": *"tracked in an `httpOnly` cookie, `fd_mfa_attempts`, following the
`fd_password_recovery` precedent in `lib/auth/recovery.ts` (`httpOnly`, `sameSite: 'lax'`, `secure`
when https, `path: '/'`, `maxAge` 10 minutes)"*, plus the `bumpFailedAttempts` / `clearFailedAttempts`
signatures, which take no arguments.

`lib/auth/recovery.ts` only exports the cookie name and a max-age; the attribute set the design is
copying lives in `app/(auth)/callback/route.ts`, where `secure` is derived from the request:
`secure: request.nextUrl.protocol === 'https:'`. `bumpFailedAttempts()` runs inside a server action
and has no `NextRequest`, so "`secure` when https" has no stated source. An implementer has at least
three plausible readings (`true` always, `NODE_ENV === 'production'`, parse
`NEXT_PUBLIC_SITE_URL`), and the failure is quiet rather than loud: `secure: true` on
`http://localhost:3000` means the browser drops the cookie, `bumpFailedAttempts()` reads `undefined`
→ treats it as 0 → always returns 1, so the five-failure sign-out never fires and AC10's second half
cannot be demonstrated in dev even though the unit test (which mocks `cookies()`) passes.

**Fix.** Pin the attributes in one place in `lib/auth/mfa.ts` next to the other constants and state
the `secure` source explicitly:

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
Add one line to "Attempt bound" saying the callback keeps its request-derived `secure` for
`fd_password_recovery` and the action path uses `NODE_ENV` because no request object is in scope.

---

### 3. MEDIUM — The new `proxy.test.ts` and `callback/route.test.ts` have no specified Vitest environment, and the repo has no precedent for `NextRequest` under jsdom

**Where:** "Testability": *"`proxy.test.ts` mocks `@/lib/supabase/middleware` … constructs a real
`NextRequest`, and asserts on `response.status`"*, and the `app/(auth)/callback/route.test.ts` row in
"Files touched".

`vitest.config.ts` sets `environment: 'jsdom'` globally with no per-directory override, and I
confirmed that **no existing test file in the repo imports `NextRequest`, `NextResponse`, or
`next/experimental/testing/server`** — grep over `**/*.test.{ts,tsx}` returns nothing. So the two new
Route-Handler/proxy test files are the first to construct Next server primitives, they will do it
under a DOM global environment, and `vitest.config.ts` is explicitly out of scope for this run, so the
environment cannot be fixed centrally. jsdom provides no `fetch`/`Request`/`Response`/`Headers`, which
leaves those globals coming from Node's undici by inheritance — workable in principle, but an
unverified assumption in a design that otherwise specifies mock shapes, assertion ordinals, and even
which helper name not to "correct".

(Two adjacent claims in the same section *are* verified and should stay: `next` ships no `exports`
map, `node_modules/next/experimental/testing/server.d.ts` re-exports
`dist/experimental/testing/server`, and `unstable_doesMiddlewareMatch` is the only matcher helper
there — there is no `unstable_doesProxyMatch`.)

**Fix.** Specify a per-file environment docblock in the Testability section and in the "Files
touched" rows, so the choice is not left to the implementer:

```ts
// @vitest-environment node
import { NextRequest } from 'next/server'
```

for `proxy.test.ts` and `app/(auth)/callback/route.test.ts`. `lib/auth/mfa.test.ts`,
`app/(auth)/actions.test.ts`, `lib/data/organization.test.ts`, and `lib/validations/auth.test.ts`
touch no Next server primitives and stay on the default jsdom environment.

---

### 4. NIT — The layer-3 insertion snippet returns `[]` for three functions whose return type is not an array

**Where:** "Enforcement layer 3", the two-line snippet
(`if (!(await isMfaSatisfiedForUser(supabase, user))) return []`), applied to a table of ten
functions whose "Return shape today" column correctly notes `[]` / `null` / an empty-counts object.

The table is right and the snippet is wrong for three of the ten: `getConversationNavCounts` returns
`{ unreadConversations: number; unreadMessages: number }` (it already has a local
`const empty = { unreadConversations: 0, unreadMessages: 0 }` at `lib/data/conversations.ts:155` and a
surrounding `try`), `getConversationById` returns `Conversation | null`, and
`getConversationRecordingUrl` returns `string | null`. Copying the snippet literally is a `tsc`
failure under NFR 27 — loud, not dangerous, but avoidable.

**Fix.** Replace the single snippet with the per-function denial value:

```ts
// clients, integrations, phone-numbers, staff, sidebar-preferences, conversations (list)
if (!(await isMfaSatisfiedForUser(supabase, user))) return []
// getConversationNavCounts (inside the existing try, after `if (!user) return empty`)
if (!(await isMfaSatisfiedForUser(supabase, user))) return empty
// getConversationById, getConversationRecordingUrl
if (!(await isMfaSatisfiedForUser(supabase, user))) return null
```

All ten cited line numbers are otherwise exact in the worktree (`clients.ts:12`,
`conversations.ts:125/152/204/234/261`, `integrations.ts:8`, `phone-numbers.ts:23`, `staff.ts:15`,
`sidebar-preferences.ts:3`), as are the two deliberate exclusions (`phone-numbers.ts:49` and `:60`).

---

### 5. NIT — The `getCurrentOrgAndUser` consumer census is 16 sites in 16 files, not 15/15

**Where:** "Enforcement layer 2": *"Verified consumer list (15 call sites, 15 files, excluding the
definition)"*, and the response log's NIT 5 (*"its '15 call sites across 14 files' … is 15 sites
across **15** files"*).

`app/(dashboard)/agents/[id]/page.tsx:20` is missing from the enumeration — the same bracketed-path
blind spot as finding 1. The behavioral conclusion is unaffected: that page does
`if (!context) redirect('/login')` like the others, so there is still no caller to update.

One detail worth adding while correcting the list: that page calls `getAgentById(id)` and
`notFound()` at lines 19 before resolving `getCurrentOrgAndUser()` at line 20, so a pending-MFA
session reaches a data read before the layer-2 gate denies. Nothing renders (the redirect follows)
and the proxy prevents arriving there at all, but "layer 2 gates before any protected read" is not
literally true for this route.

**Fix.** Change "15 call sites, 15 files" to "16 call sites, 16 files", add
`app/(dashboard)/agents/[id]/page.tsx` to the list, and add one sentence to the bypass analysis noting
the pre-gate read on that route and that the proxy is what covers it.

---

### 6. NIT — `pattern={REGEXP_ONLY_DIGITS}` *is* forwarded to the real input; the stated mechanism is wrong

**Where:** "The verify form": *"`pattern={REGEXP_ONLY_DIGITS}` is **consumed by `input-otp`**, which
compiles it into an internal `RegExp` used to reject non-digit keystrokes and pastes — it is not
forwarded to the `<input>` as an HTML attribute"*, flagged as "verified against `input-otp@1.4.2`'s
`dist/index.mjs`", and the response log's NIT 11.

Both halves of the first clause are right, the last clause is not. In `input-otp@1.4.2`'s
`dist/index.mjs`, `pattern` is destructured out of props *and* re-applied to the rendered input as
`pattern: m == null ? void 0 : m.source` — i.e. the compiled `RegExp`'s `.source`, so the real
`<input>` carries `pattern="^\d+$"`. Harmless (the value is always six digits when the form submits,
and HTML `pattern` would accept it), and the delivered behavior is exactly what the design wants, but
an implementer reading "not forwarded" and then seeing the attribute in devtools will go looking for
a bug. The same file confirms the adjacent claims: `autoComplete: a.autoComplete || "one-time-code"`
is the library default, and `inputMode` plus all remaining props (`id`, `disabled`, `autoFocus`,
`aria-*`) are spread onto the input.

**Fix.** Replace the clause with: *"`pattern` is consumed by `input-otp`, compiled into an internal
`RegExp` that rejects non-digit keystrokes and pastes, and also re-emitted on the real input as
`pattern="^\d+$"` (`regexp.source`). The keystroke filtering, not the HTML attribute, is what this
design relies on."*

---

### 7. NIT — The `proxy.md` block quote is paraphrased and both line citations are off by one

**Where:** "Enforcement layer 1", the quote attributed to
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:249`, and the
companion reference to the warning at `:251`.

The passage is at **:248**, and the warning at **:250**. The actual text ends *"…will also skip
Server Function calls on that path"*, not *"…will also skip Proxy coverage"*. The substance the
design draws from it is correct, and the warning at :250 (*"Always verify authentication and
authorization inside each Server Function rather than relying on Proxy alone"*) does justify layers 2
and 3.

**Fix.** Quote :248 verbatim and cite :248/:250.

---

### 8. NIT — `/llms.txt` is a real public asset that the matcher catches and the allowlist misses

**Where:** "Exempt paths", `MFA_EXEMPT_PREFIXES`, which enumerates `/robots.txt`, `/sitemap.xml`,
and `/manifest.webmanifest` by name.

`public/llms.txt` exists in the worktree and is served at `/llms.txt`. `config.matcher` excludes only
`_next/static`, `_next/image`, `favicon.ico`, and the image extensions, so `.txt` is matched and a
pending-MFA session gets a 307 to `/verify` for it. Impact is negligible (crawlers are not signed in,
and nothing in the app fetches it), but the design's list is explicitly exhaustive about the other
three metadata routes, and `public/`'s remaining files are all `.svg`/`.png` and so already excluded
by the matcher.

**Fix.** Add `'/llms.txt'` to `MFA_EXEMPT_PREFIXES` next to `/robots.txt`, or add a sentence saying it
is deliberately gated.

---

### 9. NIT — `endPendingSession`'s `signOut()` failure is unspecified, which leaves a hole in the never-rejects posture

**Where:** "The verify and cancel actions", the `endPendingSession` signature
(*"Signs out, clears the attempt cookie, redirects to /login?error=&lt;reason&gt;. Never returns."*),
and the error-handling table, which has rows for every `lib/auth/mfa.ts` throw path but none for
`signOut`.

`lib/auth/mfa.ts` is contractually rejection-free, but `endPendingSession` lives in
`app/(auth)/actions.ts` and calls `supabase.auth.signOut()`, which rethrows non-`AuthError`s the same
way `_getUser` does. If it rejects, `endPendingSession` never reaches its `redirect`, so the declared
`Promise<never>` becomes a rejected promise: the user stays pending with no copy and the form shows a
generic action failure. Still fail-closed, but it is the one escape path a stuck user has, and the
design spends a section arguing that failing closed and failing *usefully* are different properties.

**Fix.** Specify the body, and add the row:

```ts
async function endPendingSession(supabase, reason): Promise<never> {
  try {
    await supabase.auth.signOut()
  } catch {
    // Best effort. The redirect below still strips the user from the app, and the gate
    // keeps denying a session that survives, so this cannot fail open.
  }
  await clearFailedAttempts()
  return redirect(`/login?error=${reason}`)
}
```

(The existing `logOut` ignores the `signOut` result too, so this matches house style.)

---

### 10. NIT — "`PendingSessionEndReason` is a subset of this map's keys, so the two cannot drift" is not enforced by anything

**Where:** "`login/page.tsx` notices", after the `LOGIN_NOTICES` literal.

`LOGIN_NOTICES` is declared in `app/(auth)/login/page.tsx` and `PendingSessionEndReason` in
`app/(auth)/actions.ts`, with no reference between them, so nothing makes the subset relation a
typecheck error. Adding a fourth reason to the union and forgetting the notice yields a silent
"unknown codes render nothing" — exactly the invisible-message problem this section exists to fix.

**Fix.** Export the union and constrain the map:

```ts
// app/(auth)/actions.ts
export type PendingSessionEndReason = 'mfa_unavailable' | 'mfa_attempts' | 'mfa_cancelled'

// app/(auth)/login/page.tsx
import type { PendingSessionEndReason } from '../actions'
type LoginNoticeCode = PendingSessionEndReason | 'session_expired' | 'missing_code' | 'oauth_failed' | 'org_setup_failed'
const LOGIN_NOTICES = { /* … */ } satisfies Record<LoginNoticeCode, { tone: 'danger' | 'neutral'; text: string }>
```

---

## Verified Assumptions

Checked against source, not taken on the design's word.

**auth-js 2.112.2 (`node_modules/.pnpm/@supabase+auth-js@2.112.2/.../dist/main/`)**

- `_getAuthenticatorAssuranceLevel`'s no-argument branch derives `nextLevel` from
  `session.user.factors` read out of local (cookie) storage, exactly as quoted. The design's threat
  model — delete `user.factors` from the cookie and `nextLevel` reports `aal1` — is real.
- That branch is **not** wrapped: `decodeJWT(session.access_token)` and `session.user.factors` are
  dereferenced outside any `try`, while only the `jwt`-argument branch has one. Confirmed at the
  cited location (the design's `:5038-5060` / `:5014-5037` land within a line or two of
  `_getAuthenticatorAssuranceLevel` at `:5011`). The `try/catch` in step 3 is load-bearing.
- `decodeJWT` (`lib/helpers.js:177`) splits on `.`, regex-checks base64url, `JSON.parse`s, and
  returns the signature bytes **unverified**. The design's careful restatement — that `payload.aal`
  is trustworthy only because of the ordering dependency on `getUser()` — is correct, and the TSDoc
  precondition is the right place for it.
- `getUser()` has no local-JWKS or caching shortcut: the public method delegates to `_getUser()`,
  which always `_request`s `GET ${url}/user` with the session's access token. Every `getUser()` is a
  server-side validation. `_getUser` returns `{ data: { user: null }, error }` for `AuthError`s and
  **rethrows** everything else, so `resolveMfaGate`'s wrapper is needed.
- `_listFactors` calls `this.getUser()` first and then `user?.factors ?? []`, so treating `undefined`
  as "no factors" matches the library's own behavior on the identical read.
- `_listFactors` buckets on `status === 'verified'` with no factor-type filter, and the AAL branches
  compute `nextLevel` the same way — so step 2's decision to filter on `status === 'verified'` alone
  (and pick the TOTP factor only at step 5) is the fail-closed direction, as argued. Note the
  manifest includes a `webauthn` bucket alongside `phone`, which strengthens backlog item 7.
- With no session the AAL call returns `{ currentLevel: null, nextLevel: null }` and `error: null`,
  confirming that the `null` → pending mapping, not the error mapping, closes that case.
- All nine `error.code` values in the mapping table exist in auth-js's `ErrorCode` union:
  `mfa_verification_failed`, `mfa_verification_rejected`, `mfa_challenge_expired`, `otp_expired`,
  `over_request_rate_limit`, `mfa_factor_not_found`, `mfa_ip_address_mismatch`,
  `mfa_totp_verify_not_enabled`, `insufficient_aal`.

**`@supabase/ssr` 0.12.4**

- `SetAllCookies` takes `(cookies, headers)`, and the doc comment the design quotes about CDN caching
  and one user's token being served to another is verbatim, including the three header values.
  `CookieOptions` (= `Partial<SerializeOptions>`) is re-exported from the package root.
- `docker/nginx.conf` exists, so the cached-`Set-Cookie` concern is not hypothetical.
- One correction to the framing: `SetAllCookies` *declares* `headers` as a required parameter, but
  TypeScript lets an implementation take fewer parameters, so the type does not force a caller to
  accept it. The design's version-note fallback is still correctly specified; only the word
  "mandatory" overstates it.

**Next.js 16.4**

- The server-action claim is stronger than the design says. `createServerModuleMap`
  (`dist/server/app-render/manifests-singleton.js`) resolves an action id through
  `workers[normalizeWorkerPageName(workStore.page)]` and throws `getActionNotFoundError` when the
  current page has no entry. So the 307-follow re-POST to `/verify` carrying a dashboard
  `Next-Action` header cannot execute that action on the exempt path — the design's "the action does
  not run; the client sees a failed action" is right, and the obvious 307-preserves-method bypass is
  closed by the framework.
- `next` ships no `exports` map; `next/experimental/testing/server` resolves to
  `dist/experimental/testing/server/index`, and `unstable_doesMiddlewareMatch({ config, url, headers,
  cookies, nextConfig })` is the exported name. There is no proxy-named variant. The instruction not
  to "correct" the name is right.
- The existing `config.matcher` excludes only `_next/static`, `_next/image`, `favicon.ico`, and the
  six image extensions, so page navigations, RSC payloads, and action POSTs all reach `proxy()`;
  `/_next/static/chunk.js` does not match (the negative lookahead rejects it), matching the design's
  planned matcher assertions.

**The worktree**

- Branch `feat/totp-login-challenge`, clean tree apart from this pipeline folder. No `node_modules`
  (so verification step 1 is necessary), and `pnpm-lock.yaml` pins exactly the versions every claim
  was verified against: `zod@3.25.76`, `@supabase/ssr@0.12.4`, `@supabase/supabase-js@2.112.2`,
  `input-otp@1.4.2`. `--frozen-lockfile` therefore reproduces them even though `package.json` says
  `latest` / `^3.23.8`, which makes the `AUTH_NO_STORE_HEADERS` fallback unlikely to be needed.
- `logIn` is exactly as described (`signInWithPassword` then a bare `redirect('/')`), `updateSession`
  makes exactly one `supabase.auth.getUser()` whose only purpose is the cookie refresh (so the
  gate's internal call genuinely replaces it and the request count is unchanged), and `proxy()` does
  nothing but return it.
- `app/(auth)/actions.test.ts` mocks `next/navigation` as a non-throwing
  `redirect: vi.fn()` at module level, and `signOutAllDevices`'s test asserts the action *resolves*
  after calling `redirect`. The design's insistence on explicit `return redirect(...)` plus ordinal
  `toHaveBeenNthCalledWith` / `toHaveBeenCalledTimes` assertions is correct and necessary. (The mock
  is at lines 9-11, not 7-9.)
- `callback/route.ts` builds `NextResponse.redirect(destination)` before the exchange and rebuilds it
  inside `setAll`, exactly the ordering problem the design describes; the `missing_code` /
  `oauth_failed` / `org_setup_failed` early returns, the open-redirect comment, and the
  `fd_password_recovery` options are as quoted. The early returns already discard refreshed cookies
  today, so deferring response construction changes nothing there.
- `lib/auth/recovery.ts` exports only the cookie name and a 15-minute max-age (see finding 2).
- `lib/supabase/server.ts` imports `server-only` and swallows `cookieStore.set` failures in a bare
  `catch {}` — both as described, and the reason `lib/auth/mfa.ts` must stay context-neutral.
- `getCurrentOrgAndUser` is AAL-blind and returns `null` in three places; every consumer I read
  handles `null` with `redirect('/login')`, and `getAnalyticsForRange`
  (`app/(dashboard)/analytics/actions.ts:34-41`) returns
  `{ error: 'You must be signed in to view analytics.' }` verbatim — so AC6 is literally
  demonstrable there.
- `app/smb/access.ts`'s `isOrganizationMember()` compares `context?.org.id`, so it does return
  `false` for a pending session, as the design admits.
- All ten layer-3 functions and both deliberate exclusions are at the cited lines.
- `app/(auth)/` contains `callback`, `forgot-password`, `login`, `reset-password`, `signup` and no
  `verify`, so `/verify` is free; `login/loading.tsx` and `signup/loading.tsx` exist as the
  `loading.tsx` precedent; `app/(auth)/layout.tsx` supplies `w-full max-w-xs` and the `<Logo />` and
  mounts no `ThemeProvider`; `reset-password/page.tsx` is the terminal-panel precedent ("This link
  has expired", centered `space-y-4`, `text-2xl font-semibold`, `text-sm text-muted-foreground`
  email line) and `login/page.tsx` ignores `searchParams` today.
- `components/auth/` holds `login-form.tsx` and `reset-password-form.tsx`, so
  `components/auth/verify-code-form.tsx` matches convention.
- `components/ui/input-otp.tsx` exports `InputOTP`/`InputOTPGroup`/`InputOTPSlot`;
  `InputOTPSlot` carries `aria-invalid:border-destructive` and `data-[active=true]:ring-ring/50`,
  and `InputOTPGroup` uses `has-aria-invalid:`, which cannot match the input because `input-otp`
  renders it as a sibling of the group — so setting `aria-invalid` on both the input and each slot is
  the right call. `input-otp` exports `REGEXP_ONLY_DIGITS` (a string, `"^\\d+$"`), and
  `onComplete` is typed `(...args: any[]) => unknown`, which is why handing it RHF's `handleSubmit`
  would misplace the value.
- `settings-client.tsx:193-194` are `enrollCode` / `enrollError`; `:364` is the
  `<InputOTP maxLength={6} value={enrollCode} onChange={setEnrollCode}>` with six slots and only
  those three props. `settings/actions.ts:16` is `getOrgId(supabase)`, the dependency-injection
  precedent. `components/ui/button.tsx` has a `ghost` variant.
- `getTotpFactorStatus` ships today on `mfa.listFactors()` and the settings page renders TOTP status
  for an ordinary (aal1) session, which is good evidence that GoTrue's `/user` returns `factors` at
  aal1 — the unstated premise the whole gate rests on.
- `app/globals.css` defines `--color-danger`, `--color-danger-subtle`, `--color-success`,
  `--color-warning` and their subtle variants, so `text-danger` / `bg-danger-subtle` are real and no
  raw palette class is needed.
- `app/manifest.ts`, `app/robots.ts`, and `app/sitemap.ts` all exist, confirming the three metadata
  routes the exempt list names. `app/api/` contains exactly `assistant`, `webhooks/{livekit,
  assemblyai}`, `livekit/endpoint`, `conversations/[id]/recording`, and
  `integrations/{google,microsoft}-calendar/callback` — so the allowlist's two API exemptions and its
  four deliberate non-exemptions are complete and correctly reasoned.
- `ARCHITECTURE.md` line 97 is the Auth Flow bullet quoted verbatim (with the dangling `TODO.md`
  pointer), line 99 is password recovery, and line 100 is the `proxy.ts` / `updateSession` line — all
  three citations exact.
- `vitest.config.ts` excludes `**/.claude/worktrees/**` and not `**/.worktrees/**`, so verification
  step 3 and backlog item 5 are both justified. All four baseline test files cited in the
  requirements exist, so step 4's "measure it yourself" is the right call.
- `eslint.config.mjs` is `eslint-config-next` core-web-vitals + typescript only, so `autoFocus` on
  the OTP input will not trip a `jsx-a11y/no-autofocus` rule.
- Zod resolves to the classic v3 API: `z.string({ required_error })` is valid, and `.trim()` returns
  a `ZodString` whose checks run in declaration order, so `.trim().regex(/^\d{6}$/)` strips
  whitespace before the pattern check as claimed.

## Unverified / Wrong Assumptions

**Wrong**

1. "60 `auth.getUser(` call sites across 28 non-test files … 45 calls across 17 files" — actually
   72/29 and 57/18; `app/(dashboard)/agents/[id]/actions.ts` (12 calls) is missing. Finding 1.
2. "Verified consumer list (15 call sites, 15 files)" for `getCurrentOrgAndUser` — actually 16/16;
   `app/(dashboard)/agents/[id]/page.tsx` is missing. Finding 5.
3. "`pattern` … is not forwarded to the `<input>` as an HTML attribute" — it is, as
   `pattern={regexp.source}`. Finding 6.
4. The `proxy.md` quote is a paraphrase, and `:249`/`:251` are `:248`/`:250`. Finding 7.
5. "The `headers` parameter is mandatory in `@supabase/ssr`'s `SetAllCookies` type" — the parameter is
   declared, but TypeScript permits a one-parameter implementation, so nothing forces a caller to
   accept it. Does not change the design; the sentence overstates the type's guarantee.
6. "following the `fd_password_recovery` precedent in `lib/auth/recovery.ts` (`httpOnly`,
   `sameSite: 'lax'`, `secure` when https, …)" — that module holds only the name and max-age; the
   attributes live in `callback/route.ts` and derive `secure` from the request. Finding 2.

**Unverifiable statically (correctly on the design's manual list, except where noted)**

7. That this Supabase project emits `aal`/`aal2` claims and issues OAuth sessions at `aal1`. Needs a
   live project. Fails closed if the claim is absent (`currentLevel: null` → pending).
8. That GoTrue's `/user` response includes `factors` for an `aal1` session. The design never states
   this as an assumption, and the whole gate fails *open* if it is false. Strongly supported by
   `getTotpFactorStatus` shipping on the same read, but worth adding to the manual list explicitly:
   sign in as a TOTP-enrolled user and confirm `getUser()` returns a verified factor before verifying.
9. That `mfa.verify()`'s refreshed `aal2` cookies survive a real server-action round trip.
10. NFR 26's no-extra-round-trip claim. The static part checks out (the proxy's `getUser()` is
    replaced, not added; layers 2 and 3 add only a storage-local AAL read), but "no measurable
    regression" needs measuring.
11. The real test baseline (`AGENTS.md` says 3 files, the requirements say 10 failures across 4).
    Verification step 4 handles it.
12. Whether `NextRequest` / `NextResponse` behave under the global jsdom environment. Finding 3.
13. Whether concurrent runs have already rewritten the layer-3 helpers or created
    `app/(dashboard)/analytics/actions.test.ts`. The tree was clean when I read it, so nothing has
    landed yet; deviation 3's "drop that file's edit and record it" instruction stands.
