import { createClient } from '@/lib/supabase/server'
import type { NotificationType } from '@/lib/notifications/types'

export type NotificationRow = {
  id: string
  type: NotificationType
  title: string
  body: string
  linkPath: string
  isRead: boolean
  createdAt: string
}

const DEFAULT_LIMIT = 10

/**
 * The org's newest notifications, bounded. Degrades to `[]` with a logged error
 * — an unapplied migration 047 must not 500 the dashboard layout, the same
 * defensive shape `getConversationNavCounts()` uses.
 *
 * Callers resolve `organizationId` from the session, never from a client.
 */
export async function getRecentNotifications(
  organizationId: string,
  limit: number = DEFAULT_LIMIT
): Promise<NotificationRow[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, link_path, is_read, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[notifications] recent notifications read failed:', error)
      return []
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      linkPath: row.link_path,
      isRead: row.is_read,
      createdAt: row.created_at,
    }))
  } catch (error) {
    console.error('[notifications] recent notifications read failed:', error)
    return []
  }
}

/** Unread count for the badge. Degrades to `0` on any failure. */
export async function getUnreadNotificationCount(organizationId: string): Promise<number> {
  try {
    const supabase = await createClient()
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('is_read', false)

    if (error) {
      console.error('[notifications] unread count failed:', error)
      return 0
    }

    return count ?? 0
  } catch (error) {
    console.error('[notifications] unread count failed:', error)
    return 0
  }
}
