# Requirements — enforce TOTP two-factor at login

## Summary

TOTP enrollment shipped (commit `98692e0`) but login never asks for a code. A user who enrolls a
TOTP factor in settings can still sign in with email and password alone, so the product advertises
protection it does not provide. This work closes that gap: after a successful password sign-in, a
user whose account requires Authenticator Assurance Level 2 (aal2) must verify a 6-digit TOTP code
before the session counts as authenticated, and a session that is aal1-but-requires-aal2 must not
reach protected data through any path — UI navigation, direct URL entry, Server Components, or
server actions.

Scope is the `app/(auth)/**` route group, `proxy.ts`, a new verify-code screen, an additive schema
in `lib/validations/**`, and the Auth Flow line in `developer-docs/ARCHITECTURE.md`. Everything
else in the repo is owned by concurrent runs and must not be touched.

Verified starting state, for reference:

- `logIn` in `app/(auth)/actions.ts` calls `signInWithPassword` and immediately `redirect('/')`.
- `proxy.ts` only calls `updateSession` from `lib/supabase/middleware.ts`, which refreshes Supabase
  cookies and does no authorization. There is currently no redirect logic in the interception layer.
- Protected surfaces guard themselves: `app/(dashboard)/layout.tsx` and
  `app/(settings)/settings/page.tsx` call `getCurrentOrgAndUser()` (`lib/data/organization.ts`) and
  `redirect('/login')` when it returns null. `getCurrentOrgAndUser` checks only that a user exists —
  it is AAL-blind. `app/onboarding/layout.tsx` guards similarly.
- `app/(auth)/callback/route.ts` handles both OAuth and password recovery, sets the
  `fd_password_recovery` cookie for recovery, and deliberately refuses caller-supplied redirect
  targets (open-redirect note in the file).
- The `(auth)` layout does not mount `ThemeProvider`, so auth screens render in the default (light)
  token set only.

## Functional requirements

### Login challenge

1. After `signInWithPassword` succeeds, the system must determine the session's assurance level via
   `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. When `currentLevel` is `aal1` and
   `nextLevel` is `aal2`, login is incomplete: the user must be sent to a verify-code screen instead
   of the dashboard.
2. When `currentLevel` already equals `nextLevel` (no verified TOTP factor, or already aal2), login
   must complete exactly as it does today, with no extra screen, no extra redirect hop visible to
   the user, and no change to the existing error messages.
3. The verify-code screen must live in the `app/(auth)/` route group alongside `login/`, accept a
   6-digit code, verify it against the user's verified TOTP factor using
   `supabase.auth.mfa.challenge()` + `supabase.auth.mfa.verify()`, and on success complete the login
   and continue to the post-login destination.
4. The post-login destination must be a fixed internal path or a validated internal relative path.
   A caller-supplied absolute URL must never be used as a redirect target, consistent with the
   existing refusal in `callback/route.ts`.
5. The verify screen must offer an explicit way out (cancel / "use a different account") that signs
   the user out and returns them to `/login`.

### The gate must be real

6. A session that is aal1 while `nextLevel` is `aal2` must not reach any protected application
   surface. At minimum: all `(dashboard)` routes, `(settings)` routes, and `onboarding`. Such a
   request must be redirected to the verify-code screen.
7. Enforcement must hold for direct URL navigation, not only for the redirect that the login form
   performs.
8. Enforcement must hold for Server Component data fetching and for server actions invoked with a
   pending-MFA session, not only for navigations. A server action that mutates or reads
   organization-scoped data must refuse a pending-MFA session.
9. The verify-code screen itself, the sign-out action, and the static/auth routes must remain
   reachable with a pending-MFA session, otherwise the gate deadlocks the user.
10. An abandoned flow must never leave a usable session. A user who closes the tab at the verify
    screen and returns later must land back at the verify screen or at `/login` — never inside the
    app.
11. No existing access control may be weakened or removed to make the gate work. If the gate appears
    to require that, stop and report instead.

### Failure handling

12. A wrong code must be rejected with a clear message, must not complete login, and must leave the
    user on the verify screen able to retry.
13. An expired or already-used challenge must be handled distinctly from a wrong code: the user is
    told the code window elapsed and a fresh challenge is issued or can be requested.
14. Repeated wrong attempts must be bounded. Supabase's own rate-limit errors must be surfaced as a
    friendly "too many attempts, wait and try again" message, and the flow must additionally end the
    pending session (sign the user out back to `/login`) after a bounded number of failed attempts
    in one challenge.
15. Error copy must be derived from Supabase's error conditions, not raw `error.message` text, and
    must follow the existing `friendlyAuthError` style in `app/(auth)/actions.ts`.
16. A missing or malformed verified TOTP factor at challenge time (enrollment deleted mid-flow,
    `listFactors` failure) must fail closed: the user is signed out with a generic message rather
    than being allowed through.

### OAuth

17. The OAuth callback path must be covered by the same decision. Required behavior: Google sign-in
    users who have a verified TOTP factor are also challenged. Supabase issues an aal1 session for
    OAuth sign-in too, so the assurance-level gate applies identically; letting OAuth skip the code
    would be a trivial bypass of the whole feature. The implementation must state in the design how
    the callback reaches the verify screen rather than the dashboard.
18. The password recovery branch of the callback (`?flow=recovery` → `fd_password_recovery` cookie →
    `/reset-password` → `updatePassword`) must keep working unchanged.

### Validation

19. The 6-digit code input must be validated by a Zod schema in `lib/validations/` (additive change
    to `lib/validations/auth.ts` or a new file), not inline in the action or component. Rules:
    required, string, exactly 6 characters, digits only, whitespace trimmed before validation.
    Validation failure returns a field-level message in the same `{ error: string }` shape the other
    auth actions use and performs no Supabase call.

### UI

20. The verify screen must mirror the structure and visual language of the existing `login/` and
    `reset-password/` pages: `(auth)` layout, max-width card, sentence-case heading, Geist, tokens
    from `app/globals.css` (`danger` / `danger-subtle` for errors, never raw palette classes),
    `lucide-react` icons, shadcn/ui on `@base-ui/react` with `render={<Component />}` composition
    (not Radix `asChild`).
21. The code input must be accessible: a real label, `inputMode="numeric"`,
    `autoComplete="one-time-code"`, error text programmatically associated with the input and
    announced, and a visible focus ring using the `brand` ring token.
22. The screen must look correct in the theme modes the `(auth)` group actually supports — that
    group has no `ThemeProvider`, so it renders in the default token set; do not assume dark mode is
    available there.

### Docs

23. Update the Auth Flow line in `developer-docs/ARCHITECTURE.md` that currently reads "login-time
    AAL2 challenge not yet enforced" to describe the shipped behavior, including the pending-MFA
    gate and where it is enforced.
24. Do **not** edit `developer-docs/TODO.md` or `README.md`. Concurrent runs contend for those files
    and the orchestrator writes them centrally. Instead, the final report must state in two or three
    sentences exactly what shipped so the orchestrator can mark "Enforce TOTP at login" /
    "Enforce two-factor at login" done.

## Non-functional requirements

25. **Security posture:** the gate fails closed. Any inability to determine assurance level (API
    error, unexpected response shape) must be treated as "not satisfied" rather than "allow".
26. **No regression in latency for the common path:** the assurance-level check on login and on
    gated requests must not add a network round-trip per navigation beyond what Supabase's client
    already performs for session handling.
27. **Typecheck clean:** `pnpm exec tsc --noEmit` passes. The repo is currently clean and must stay
    that way.
28. **Tests:** `pnpm test` shows no failures beyond the documented baseline of 10 pre-existing
    failures in `app/smb/actions.test.ts`, `lib/data/analytics.test.ts`,
    `lib/data/availability-engine.test.ts`, and `lib/voice/adapters/fish-audio-tts.test.ts`.
29. **Lint:** `pnpm exec eslint` on changed files only is clean. Full-repo `pnpm lint` is not a gate
    (29 pre-existing errors).
30. **Next.js 16.4 correctness:** any route, redirect, cookie, or request-interception code must
    follow the guides in `node_modules/next/dist/docs/`. Request interception is `proxy.ts` with an
    exported `proxy` function; `middleware.ts` does not apply.
31. **Worktree discipline:** all work happens in
    `e:\Projects\frontdesk-ai\.worktrees\totp-login-challenge` on branch
    `feat/totp-login-challenge`. No merge, rebase, or any edit to `main` or the main checkout. No
    edits to `lib/voice/**`, `workers/**`, `lib/queue/**`, `lib/email/**`,
    `components/layout/app-sidebar.tsx`, the header notification popover,
    `lib/data/booking-service.ts`, `package.json`, or `playwright.config.ts`.

## Acceptance criteria

1. A user with no verified TOTP factor submits correct credentials on `/login` and lands on the
   dashboard with no intermediate screen. Covered by a test asserting the existing redirect target
   is unchanged.
2. A user whose session reports `currentLevel: 'aal1'`, `nextLevel: 'aal2'` submits correct
   credentials and is sent to the verify-code screen, not the dashboard. Test asserts the redirect
   target.
3. Submitting the correct 6-digit code calls `mfa.challenge()` then `mfa.verify()` with the verified
   factor id and the challenge id from the challenge response, and then redirects to the post-login
   destination.
4. Submitting a wrong code returns a user-facing error, does not redirect, and leaves the session
   un-elevated (no `verify` success path taken).
5. A request to a protected route (`/`, a `(dashboard)` child route, `/settings`, `/onboarding`)
   carrying an aal1 session that requires aal2 does not render protected content and is redirected
   to the verify-code screen. Test exercises the enforcement layer directly with a mocked pending
   session.
6. The same aal1-requires-aal2 session, used to invoke an organization-scoped server action, is
   refused rather than served. Test asserts the refusal, not just a thrown redirect.
7. A pending-MFA session can still load the verify-code screen and still invoke sign-out, so the
   gate cannot deadlock.
8. Abandoning the flow: a pending-MFA session that returns to `/` later is redirected to the verify
   screen (or `/login`), and a test demonstrates it never reaches protected content.
9. Code input validation: empty, 5-digit, 7-digit, and non-numeric inputs are rejected by the Zod
   schema with a field message and without any Supabase call. Schema unit test covers each case.
10. A Supabase rate-limit error during verify surfaces the friendly "too many attempts" copy, and
    exceeding the local failed-attempt bound signs the pending session out to `/login`.
11. An expired/reused challenge surfaces copy distinct from the wrong-code message.
12. A Google OAuth sign-in by a user with a verified TOTP factor ends at the verify-code screen, not
    the dashboard; the recovery branch of the callback still ends at `/reset-password` with the
    `fd_password_recovery` cookie set.
13. `pnpm exec tsc --noEmit` is clean; `pnpm exec eslint <changed files>` is clean; `pnpm test`
    adds no failures beyond the 10-failure baseline.
14. The bypass analysis is written down and backed by tests, covering at minimum: direct URL
    navigation to a protected route, a server action called with an aal1 session, and the abandoned
    flow. A claim without an exercising test does not satisfy this criterion.
15. `developer-docs/ARCHITECTURE.md` no longer says the login-time AAL2 challenge is unenforced and
    describes the gate accurately. `developer-docs/TODO.md` and `README.md` are unmodified in the
    diff.

## Out of scope

- Backup/recovery codes, SMS or email second factors, WebAuthn, and any new factor type. Supabase
  TOTP only. A user who loses their authenticator remains locked out and must be recovered manually
  — noted as an accepted risk, not solved here.
- "Remember this device" / trusted-device skipping of the challenge.
- Organization-level policy to require two-factor for all members, and any admin-facing enforcement
  UI or settings toggle.
- Changes to the enrollment flow in `app/(settings)/settings/actions.ts` (`enrollTotpFactor`,
  `verifyTotpEnrollment`, `unenrollTotpFactor`, `getTotpFactorStatus`). They are read as reference
  and reused as patterns, not modified.
- Step-up re-authentication for individual sensitive operations (for example requiring a fresh code
  before unenrolling TOTP or changing billing).
- Public `app/smb/[slug]` booking pages, webhook routes, and worker/voice paths — they do not carry
  user sessions and are unaffected.
- Editing `developer-docs/TODO.md` and `README.md` (orchestrator-owned this run).
- Playwright / end-to-end coverage; `playwright.config.ts` is owned by a concurrent run.

## Assumptions

1. **Doc conflict resolved toward the coordination rules.** The brief's "Docs to update when done"
   section lists `developer-docs/TODO.md` and `README.md`, but its coordination rules explicitly
   forbid touching them because parallel runs contend for the same lines. The coordination rules win;
   only the `ARCHITECTURE.md` Auth Flow line is edited here, and the final report carries the
   information the orchestrator needs for the other two.
2. **OAuth is challenged, not exempt.** Inferred from the security framing: an exempt OAuth path
   would be a one-click bypass. This also assumes Supabase reports `nextLevel: 'aal2'` for an OAuth
   session belonging to a user with a verified TOTP factor; the design must confirm this against the
   installed `@supabase/supabase-js` auth client rather than assuming it.
3. **Post-login destination stays `/`.** Nothing today captures an intended destination before
   login — `logIn` and the OAuth callback both go to `/`. "Proceeds to the intended destination" is
   therefore read as "the normal post-login destination", with intended-destination capture allowed
   only if it uses internal-relative validation. Building a general return-to mechanism is not
   required.
4. **Failed-attempt bound.** The brief requires bounded attempts but gives no number. Assumed: 5
   failed verifications within one pending login, after which the pending session is signed out.
   The design may adjust the number with reasoning but must state one.
5. **Pending state is represented explicitly.** Following the `fd_password_recovery` precedent, the
   pending-MFA state is assumed to be legible to the enforcement layer (cookie or assurance-level
   read) so `proxy.ts` can gate without a database round-trip. The exact mechanism is a design
   decision; the requirement is only that it is server-side and tamper-resistant — a cookie that a
   client can clear must not grant access.
6. **`getCurrentOrgAndUser` is the server-side chokepoint.** Every protected Server Component and
   server action path already funnels through it, so it is assumed to be the natural place to add
   the server-side half of the gate. Confirming that there is no protected surface bypassing it is
   part of the design's bypass analysis.
7. **Supabase's own rate limiting exists** for `mfa.verify`, so the local attempt bound is defense
   in depth rather than the only control.
