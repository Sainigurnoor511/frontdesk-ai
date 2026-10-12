import { createClient } from '@/lib/supabase/server'
import { getAssuredUser } from '@/lib/auth/mfa'

export async function getHiddenSidebarItems(organizationId: string): Promise<string[]> {
  const supabase = await createClient()
  const user = await getAssuredUser(supabase)

  if (!user) return []

  const { data } = await supabase
    .from('member_sidebar_preferences')
    .select('hidden_items')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  return data?.hidden_items ?? []
}
