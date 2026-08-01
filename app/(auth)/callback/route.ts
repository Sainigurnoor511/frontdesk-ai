import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
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
    const { data: org, error: orgError } = await serviceClient
      .from('organizations')
      .insert({ name: businessName })
      .select('id')
      .single()

    if (orgError || !org) {
      return NextResponse.redirect(`${origin}/login?error=org_setup_failed`)
    }

    await serviceClient
      .from('members')
      .insert({ organization_id: org.id, user_id: data.user.id, role: 'owner' })
  }

  return NextResponse.redirect(`${origin}/`)
}
