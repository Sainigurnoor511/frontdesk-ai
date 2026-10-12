import { createClient } from '@/lib/supabase/server'
import { NOTIFICATION_PANEL_LIMIT, type NotificationType } from '@/lib/notifications/types'

export type NotificationRow = {
  id: string
  type: NotificationType
  title: string
  body: string
  linkPath: string
  isRead: boolean
  createdAt: string
}

/**
 * The org's newest notifications, bounded. Degrades to `[]` with a logged error
 * — an unapplied migration 047 must not 500 the dashboard layout, the same
 * defensive shape `getConversationNavCounts()` uses.
 *
 * Callers resolve `organizationId` from the session, never from a client.
 */
export async function getRecentNotifications(
  organizationId: string,
  limit: number = NOTIFICATION_PANEL_LIMIT
): Promise<NotificationRow[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, link_path, is_read, created_at')
      .eq('organization_id', organizationId)
      // A reminder for an appointment's earlier start time, replaced by one for
      // its current time. Kept as the record of the email that went out; never
      // listed beside the new one.
      .is('superseded_at', null)
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
      // Same filter as the list: a hidden row must not hold the badge up.
      .is('superseded_at', null)

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
