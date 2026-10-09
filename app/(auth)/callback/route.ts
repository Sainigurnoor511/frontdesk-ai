import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { generateUniqueSlug } from '@/lib/data/organization-slug'
import { PASSWORD_RECOVERY_COOKIE, PASSWORD_RECOVERY_MAX_AGE_SECONDS } from '@/lib/auth/recovery'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  // A `next` param was read here but never used. Deliberately not wiring it up:
  // redirecting to a caller-supplied URL after sign-in is an open-redirect unless
  // it's validated against an allowlist, and nothing currently needs it.

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // A fixed destination chosen by a flag, never a caller-supplied URL.
  const isRecovery = searchParams.get('flow') === 'recovery'
  const destination = isRecovery ? '/reset-password' : '/'
  let response = NextResponse.redirect(`${origin}${destination}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.redirect(`${origin}${destination}`)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
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

  if (isRecovery) {
    response.cookies.set(PASSWORD_RECOVERY_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: PASSWORD_RECOVERY_MAX_AGE_SECONDS,
    })
  }

  return response
}
