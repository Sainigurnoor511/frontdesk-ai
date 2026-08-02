import { createClient } from '@/lib/supabase/server'

export type CurrentOrgAndUser = {
  user: { id: string; email: string; avatarUrl: string | null }
  org: { id: string; name: string }
  role: string
}

export async function getCurrentOrgAndUser(): Promise<CurrentOrgAndUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
