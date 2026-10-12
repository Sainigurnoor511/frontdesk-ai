import { createClient } from '@/lib/supabase/server'
import { isMfaSatisfiedForUser } from '@/lib/auth/mfa'

export async function getHiddenSidebarItems(organizationId: string): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []
  // A pending-MFA session is not signed in.
  if (!(await isMfaSatisfiedForUser(supabase, user))) return []

  const { data } = await supabase
    .from('member_sidebar_preferences')
    .select('hidden_items')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  return data?.hidden_items ?? []
}
