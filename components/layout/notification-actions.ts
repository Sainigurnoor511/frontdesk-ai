'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import {
  getRecentNotifications,
  getUnreadNotificationCount,
} from '@/lib/data/notifications'
import { notificationIdSchema } from '@/lib/validations/notification'
import type { NotificationType } from '@/lib/notifications/types'

/** Shaped view model rather than a raw row, per Next.js' "constrain return values" guidance. */
export type NotificationItem = {
  id: string
  type: NotificationType
  title: string
  body: string
  linkPath: string
  isRead: boolean
  createdAt: string
}

/**
 * Everything the header popover needs, in one call on open.
 *
 * The org comes from the session (`getCurrentOrgAndUser()` → `members`), never
 * from a parameter. A signed-out or org-less caller gets an empty panel rather
 * than an error, so the header can never break on it.
 */
export async function getNotificationPanel(): Promise<{
  items: NotificationItem[]
  unreadCount: number
}> {
  const context = await getCurrentOrgAndUser()
  if (!context) return { items: [], unreadCount: 0 }

  const [items, unreadCount] = await Promise.all([
    getRecentNotifications(context.org.id),
    getUnreadNotificationCount(context.org.id),
  ])

  return { items, unreadCount }
}

export async function markAllNotificationsAsRead(): Promise<
  { error: string } | { success: true }
> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update notifications.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('organization_id', member.organization_id)
    .eq('is_read', false)

  if (error) {
    return { error: 'Could not update notifications. Please try again.' }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function markNotificationAsRead(
  id: string
): Promise<{ error: string } | { success: true }> {
  const parsed = notificationIdSchema.safeParse({ id })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update notifications.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  // Both filters: a foreign id matches zero rows and changes nothing. RLS is the
  // second, independent gate.
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', parsed.data.id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not update notifications. Please try again.' }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
