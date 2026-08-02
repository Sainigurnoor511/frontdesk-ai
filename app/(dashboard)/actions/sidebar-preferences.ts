'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function setSidebarItemHidden(
  url: string,
  hidden: boolean
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update sidebar preferences.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { data: existing } = await supabase
    .from('member_sidebar_preferences')
    .select('id, hidden_items')
    .eq('user_id', user.id)
    .eq('organization_id', member.organization_id)
    .maybeSingle()

  const current: string[] = existing?.hidden_items ?? []
  const next = hidden
    ? Array.from(new Set([...current, url]))
    : current.filter((u: string) => u !== url)

  const { error } = await supabase.from('member_sidebar_preferences').upsert(
    {
      user_id: user.id,
      organization_id: member.organization_id,
      hidden_items: next,
    },
    { onConflict: 'user_id,organization_id' }
  )

  if (error) {
    return { error: 'Could not update sidebar preferences. Please try again.' }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
