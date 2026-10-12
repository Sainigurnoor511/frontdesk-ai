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
// alone, which is why `getCurrentOrgAndUser()` and the shared `lib/data` read helpers gate too.
export async function proxy(request: NextRequest) {
  const { response, mfa, authHeaders } = await updateSession(request)

  const needsChallenge = mfa.state === 'pending' || mfa.state === 'indeterminate'
  if (needsChallenge && !isMfaExemptPath(request.nextUrl.pathname)) {
    const redirectResponse = NextResponse.redirect(new URL(MFA_VERIFY_PATH, request.url))
    // Carrying the refreshed cookies over is required, not cosmetic: dropping them discards a
    // token Supabase just refreshed and signs the user out mid-flow.
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

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
