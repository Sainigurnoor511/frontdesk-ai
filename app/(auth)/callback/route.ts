import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { generateUniqueSlug } from '@/lib/data/organization-slug'
import { resolveMfaGate, MFA_VERIFY_PATH, POST_LOGIN_PATH } from '@/lib/auth/mfa'
import { recentRecoverySubject } from '@/lib/auth/recovery'
import { clearAttemptsAfterRecovery } from '@/lib/auth/mfa-attempts'

/**
 * Refills the TOTP attempt budget after a verified recovery link, so an owner locked out by
 * someone burning their five codes can get back in without waiting out the window. Mailbox access
 * is required to get here, which the password alone does not give. At most one refill per user per
 * hour (`clearAttemptsAfterRecovery`), so the guess rate does not follow the email quota. The
 * trade-off is in ARCHITECTURE.md (Auth Flow).
 *
 * Best effort: `clearAttemptsAfterRecovery` already logs a Redis failure and skips the refill, and
 * the catch here keeps the reset flow independent of Redis even if it ever rejects. The worst case
 * is the budget expiring with its window as it would have anyway.
 */
async function clearBudgetAfterRecovery(userId: string): Promise<void> {
  try {
    const outcome = await clearAttemptsAfterRecovery(userId)
    if (outcome === 'cleared') {
      console.warn('[auth] mfa attempt budget cleared by a verified recovery link', { userId })
    }
  } catch (error) {
    console.error('[auth] mfa attempt budget not cleared after recovery:', error)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  // A `next` param was read here but never used. Deliberately not wiring it up:
  // redirecting to a caller-supplied URL after sign-in is an open-redirect unless
  // it's validated against an allowlist, and nothing currently needs it.

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const isRecovery = searchParams.get('flow') === 'recovery'

  // Cookies and headers are collected here and applied to a response built at the end, because
  // the destination is not knowable until the session exists and its assurance level is resolved.
  const pendingCookies: { name: string; value: string; options?: CookieOptions }[] = []
  const pendingHeaders: Record<string, string> = {}

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          pendingCookies.push(...cookiesToSet)
          Object.assign(pendingHeaders, headers)
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
  }

  const serviceClient = createServiceRoleClient()
  const { data: existingMember } = await serviceClient
    .from('members')
    .select('id')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (!existingMember) {
    const businessName = data.user.email?.split('@')[0] ?? 'My Business'
    const slug = await generateUniqueSlug(serviceClient, businessName)
    const { data: org, error: orgError } = await serviceClient
      .from('organizations')
      .insert({ name: businessName, slug })
      .select('id')
      .single()

    if (orgError || !org) {
      return NextResponse.redirect(`${origin}/login?error=org_setup_failed`)
    }

    await serviceClient
      .from('members')
      .insert({ organization_id: org.id, user_id: data.user.id, role: 'owner' })
  }

  // A fixed destination chosen by a server-side flag, never a caller-supplied URL. OAuth
  // sign-ins are challenged exactly like password sign-ins: the gate is a property of the
  // session, not of the credential type, so exempting OAuth would be a one-click bypass.
  const mfa = await resolveMfaGate(supabase)
  const owesCode = mfa.state === 'pending' || mfa.state === 'indeterminate'
  let destination: string = owesCode ? MFA_VERIFY_PATH : POST_LOGIN_PATH
  if (isRecovery) {
    // A reset link gets you a new password, not entry without the code. Supabase refuses a
    // password change from an aal1 session once MFA is on ("AAL2 session is required to update
    // email or password"), so a user with a factor goes through /verify first, and
    // `verifyMfaChallenge` sends a recovery session on to /reset-password. Without a factor the
    // flow is unchanged: straight to /reset-password.
    destination = owesCode ? MFA_VERIFY_PATH : '/reset-password'

    // Only a *verified* recovery claim refills the budget; `?flow=recovery` is just a query
    // parameter. The id comes from the same signed token, and must be the user just signed in.
    const recoveredUserId = await recentRecoverySubject(supabase, {
      jwt: data.session?.access_token,
    })
    if (recoveredUserId && recoveredUserId === data.user.id) {
      await clearBudgetAfterRecovery(recoveredUserId)
    }
  }

  const response = NextResponse.redirect(`${origin}${destination}`)
  for (const cookie of pendingCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options)
  }
  for (const [key, value] of Object.entries(pendingHeaders)) {
    response.headers.set(key, value)
  }

  // No attempt-counter reset for a pending OAuth sign-in: the counter is server-side state keyed
  // by user id (`lib/auth/mfa-attempts.ts`) and a fresh first factor must not refill the budget.
  // A verified recovery link is the one exception, above.

  // No recovery cookie either. `/reset-password` and `updatePassword` read the proof of a reset
  // link from the session's own signed token (`hasRecentRecoveryClaim`), which `?flow=recovery`
  // cannot fake: that query parameter only picks the destination.

  return response
}
