import { createClient } from '@/lib/supabase/server'
import { getAssuredUser, resolveMfaGate } from '@/lib/auth/mfa'

export type CurrentOrgAndUser = {
  user: { id: string; email: string; avatarUrl: string | null }
  org: { id: string; name: string }
  role: string
}

export async function getCurrentOrgAndUser(): Promise<CurrentOrgAndUser | null> {
  const supabase = await createClient()
  const user = await getAssuredUser(supabase)

  if (!user) return null

  const { data: member } = await supabase
    .from('members')
    .select('role, organization_id, organizations(id, name)')
    .eq('user_id', user.id)
    .single()

  if (!member || !member.organizations) return null

  const org = Array.isArray(member.organizations) ? member.organizations[0] : member.organizations

  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined) ??
    null

  return {
    user: { id: user.id, email: user.email ?? '', avatarUrl },
    org: { id: org.id, name: org.name },
    role: member.role,
  }
}

/**
 * Where to send a caller that `getCurrentOrgAndUser()` just refused.
 *
 * `null` from that function means one of three things, and a bare `/login` reads as "your password
 * failed" for all of them. Resolving the gate once — only on the deny path, so it costs nothing in
 * the normal case — distinguishes a session that still owes its code from one that is simply
 * signed out, and `/login` has copy for both.
 */
export async function loginPathForDeniedSession(): Promise<string> {
  const supabase = await createClient()
  const gate = await resolveMfaGate(supabase)
  return gate.state === 'pending' || gate.state === 'indeterminate'
    ? '/login?error=mfa_required'
    : '/login'
}
