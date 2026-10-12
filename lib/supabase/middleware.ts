import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveMfaGate, type MfaGate } from '@/lib/auth/mfa'

export type UpdateSessionResult = {
  response: NextResponse
  mfa: MfaGate
  /**
   * Cache headers `@supabase/ssr` supplies alongside auth cookies. A response that sets auth
   * cookies must not be cached by a CDN or reverse proxy, otherwise one user's session token can
   * be served to another — and this repo ships an nginx reverse proxy (`docker/nginx.conf`).
   */
  authHeaders: Record<string, string>
}

export async function updateSession(request: NextRequest): Promise<UpdateSessionResult> {
  let supabaseResponse = NextResponse.next({ request })
  const authHeaders: Record<string, string> = {}

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          Object.assign(authHeaders, headers)
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  // resolveMfaGate's internal getUser() both validates the access token and triggers the cookie
  // refresh that setAll() writes into supabaseResponse. It replaces the bare getUser() this
  // function used to make, so the request count is unchanged. It never rejects.
  const mfa = await resolveMfaGate(supabase)

  // Read supabaseResponse *after* the await: setAll() reassigns it inside the closure, so
  // capturing it earlier would drop the refreshed cookies.
  return { response: supabaseResponse, mfa, authHeaders }
}
