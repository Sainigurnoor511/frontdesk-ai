'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { Bell, BellRing, FileText, UserCog, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DotLoader } from '@/components/ui/matrix'
import type { NotificationType } from '@/lib/notifications/types'
import {
  getNotificationPanel,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type NotificationItem,
} from './notification-actions'

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  post_call_summary: FileText,
  appointment_reminder: BellRing,
  client_booking: Users,
  staff_booking: UserCog,
}

/**
 * The header bell: badge, list, mark-as-read.
 *
 * Reads through a server action on open rather than taking a server-rendered
 * list, because `AppHeader` is also rendered from a client component (the
 * settings page) that has no data to pass. `initialUnreadCount` seeds the badge
 * so it is right on first paint where the layout can supply it; where it cannot,
 * one fetch on mount does the same job.
 */
export function NotificationCenter({
  initialUnreadCount,
}: {
  initialUnreadCount?: number
}) {
  const [items, setItems] = useState<NotificationItem[]>([])
  // Seeded at 0, never null: `disabled={unreadCount === 0}` must not read as
  // "enabled" before the first fetch resolves.
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount ?? 0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const panel = await getNotificationPanel()
      setItems(panel.items)
      setUnreadCount(panel.unreadCount)
    } catch (error) {
      // Keep whatever is on screen; the next open retries. No toast: the bell is
      // not the user's errand.
      console.error('[notifications] panel load failed:', error)
    } finally {
      setLoading(false)
    }
  }

  // Seed the badge where the header cannot supply a count (it is also rendered
  // from a client component, which has no server data to pass). State is written
  // from the promise callback, never synchronously inside the effect.
  //
  // Prop changes after mount are deliberately ignored — `revalidatePath`
  // re-renders the layout, and echoing the prop back would clobber the
  // optimistic decrement.
  useEffect(() => {
    if (initialUnreadCount !== undefined) return

    let cancelled = false
    getNotificationPanel()
      .then((panel) => {
        if (cancelled) return
        setItems(panel.items)
        setUnreadCount(panel.unreadCount)
      })
      .catch((error) => console.error('[notifications] panel load failed:', error))

    return () => {
      cancelled = true
    }
  }, [initialUnreadCount])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) void load()
  }

  function handleRowClick(item: NotificationItem) {
    if (item.isRead) return
    void markNotificationAsRead(item.id).catch((error) =>
      console.error('[notifications] mark as read failed:', error)
    )
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry))
    )
    setUnreadCount((current) => Math.max(0, current - 1))
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsAsRead()
    } catch (error) {
      console.error('[notifications] mark all as read failed:', error)
    }
    setItems((current) => current.map((entry) => ({ ...entry, isRead: true })))
    setUnreadCount(0)
  }

  return (
    <span className="relative inline-flex">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={<Button variant="outline" size="icon" aria-label="Notifications" />}
        >
          <Bell />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 gap-0 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="label-mono">Notifications</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAll}
              disabled={unreadCount === 0 || loading}
            >
              Mark all as read
            </Button>
          </div>
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <DotLoader />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-8 text-center">
              <Bell className="size-5 text-muted-foreground" />
              <p className="text-sm">No notifications yet.</p>
              <p className="text-xs text-muted-foreground">
                Call summaries and booking alerts show up here.
              </p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <ul>
                {items.map((item) => {
                  const Icon = TYPE_ICONS[item.type] ?? Bell
                  return (
                    <li key={item.id} data-unread={item.isRead ? 'false' : 'true'}>
                      <Link
                        href={item.linkPath}
                        onClick={() => handleRowClick(item)}
                        className={`flex gap-2.5 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/60 ${
                          item.isRead ? '' : 'bg-muted/40'
                        }`}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm">{item.title}</span>
                            {!item.isRead && (
                              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
                            )}
                          </span>
                          <span className="line-clamp-2 text-xs text-muted-foreground">
                            {item.body}
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                            {relativeAge(item.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {unreadCount > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1 -right-1 h-4 min-w-4 rounded-sm bg-brand px-0.5 text-[10px] leading-none font-medium tabular-nums text-brand-foreground"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      <span className="sr-only">{unreadCount} unread</span>
    </span>
  )
}

function relativeAge(createdAt: string): string {
  const parsed = new Date(createdAt)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${formatDistanceToNowStrict(parsed)} ago`
}
