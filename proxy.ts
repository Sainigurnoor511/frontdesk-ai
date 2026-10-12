import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { isMfaExemptPath, MFA_VERIFY_PATH } from '@/lib/auth/mfa'

// Enforcement layer 1 of the TOTP gate. Per the Next 16 proxy reference
// (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:249`):
// "Server Functions are not separate routes in this chain. They are handled as POST requests to
// the route where they are used, so a Proxy matcher that excludes a path will also skip Server
// Function calls on that path." The matcher below excludes only static assets, so page
// navigations, RSC payload requests and server-action POSTs all reach here and a pending session
// is redirected before the action runs. The same page warns at :251 not to rely on the proxy
// alone, which is why every privileged action, route handler and data helper resolves its caller
// through `getAssuredUser()` as well.

/**
 * A pending session gets one of three answers, because one response shape cannot serve all three
 * request shapes:
 *
 * - **Server Action POST** (`Next-Action` header): an `x-action-redirect` header with an empty
 *   `text/plain` body. That is the shape Next's own action client understands
 *   (`next/dist/client/components/router-reducer/reducers/server-action-reducer.js` reads the
 *   header and completes the navigation), so an already-open tab lands on the challenge screen.
 *   A plain 307 made the browser re-POST the `Next-Action` header to `/verify`, where the action
 *   does not exist, and the user saw an action-resolution error instead of a code prompt.
 * - **`/api/*` called by code**: 401 with a JSON body. These callers are `fetch`, not navigation;
 *   handing them a redirect to an HTML page makes client error handling misreport the cause.
 *   `verifyPath` is the contract fetch clients act on: they navigate there when
 *   `mfaVerifyPathFromDenial()` (`lib/auth/mfa.ts`) recognises the body, as the assistant does.
 * - **Everything else**, including an `/api/*` URL the browser *navigated* to (the Google and
 *   Microsoft calendar OAuth callbacks live under `/api/integrations/.../callback`): 303 to
 *   `/verify`. 303 rather than 307 so a POST navigation — a no-JS form submit — follows up with a
 *   GET. Whether an `/api/*` request is a navigation is decided by `isDocumentNavigation`, from
 *   the request's own intent rather than from its path.
 */
function challengeResponse(request: NextRequest): NextResponse {
  if (request.headers.has('Next-Action')) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'x-action-redirect': `${MFA_VERIFY_PATH};replace`,
        'Content-Type': 'text/plain',
      },
    })
  }

  if (request.nextUrl.pathname.startsWith('/api/') && !isDocumentNavigation(request)) {
    return NextResponse.json(
      { error: 'Two-factor verification required.', verifyPath: MFA_VERIFY_PATH },
      { status: 401 }
    )
  }

  return NextResponse.redirect(new URL(MFA_VERIFY_PATH, request.url), 303)
}

/**
 * True for a top-level browser navigation. `Sec-Fetch-Mode` is a forbidden header name, so page
 * script cannot set it, and every current browser sends `navigate` for a document load and
 * `cors` / `same-origin` / `no-cors` for `fetch`. When it is absent (an old browser, or a
 * non-browser client) the `Accept` header decides: a navigation asks for `text/html`, while
 * `fetch` defaults to the any-type wildcard and API clients ask for JSON.
 */
function isDocumentNavigation(request: NextRequest): boolean {
  const mode = request.headers.get('sec-fetch-mode')
  if (mode) return mode === 'navigate'
  return (request.headers.get('accept') ?? '').toLowerCase().includes('text/html')
}

export async function proxy(request: NextRequest) {
  const { response, mfa, authHeaders } = await updateSession(request)

  const needsChallenge = mfa.state === 'pending' || mfa.state === 'indeterminate'
  if (needsChallenge && !isMfaExemptPath(request.nextUrl.pathname)) {
    const challenge = challengeResponse(request)
    // Carrying the refreshed cookies over is required, not cosmetic: dropping them discards a
    // token Supabase just refreshed and signs the user out mid-flow.
    for (const cookie of response.cookies.getAll()) {
      challenge.cookies.set(cookie)
    }
    for (const [key, value] of Object.entries(authHeaders)) {
      challenge.headers.set(key, value)
    }
    return challenge
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
