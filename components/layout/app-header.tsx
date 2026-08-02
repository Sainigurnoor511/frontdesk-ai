'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircleMore, Bell, PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NavUser } from './nav-user'
import { SidebarToggleButton } from './sidebar-toggle-button'
import { FeedbackDialog } from './feedback-dialog'

const pageTitles: Record<string, string> = {
  '/': 'Home',
  '/guides': 'Guides',
  '/calendar': 'Calendar',
  '/availability': 'Availability',
  '/clients': 'Clients',
  '/staff': 'Staff',
  '/conversations': 'Conversations',
  '/analytics': 'Analytics',
  '/agents': 'Receptionists',
  '/organization': 'Organization',
  '/business': 'Business',
  '/integrations': 'Integrations',
  '/booking-page': 'Bookings page',
  '/settings': 'Settings',
  '/phone-numbers': 'Phone numbers',
  '/assistant': 'Assistant',
}

export function AppHeader({
  email,
  orgName,
  avatarUrl,
  showSidebarToggle = true,
  backHref,
}: {
  email: string
  orgName: string
  avatarUrl: string | null
  showSidebarToggle?: boolean
  /** When set, renders a static back-navigation icon instead of the sidebar-collapse toggle (pages with no AppSidebar, e.g. Settings). */
  backHref?: string
}) {
  const pathname = usePathname()
  const title = pageTitles[pathname] ?? ''
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  return (
    <header className="flex h-[50px] items-center justify-between border-b bg-background px-2">
      <div className="flex items-center gap-2">
        {backHref ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to app"
            className="rounded-md border text-muted-foreground"
            nativeButton={false}
            render={<Link href={backHref} />}
          >
            <PanelLeft />
          </Button>
        ) : (
          showSidebarToggle && <SidebarToggleButton className="rounded-md border" />
        )}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          nativeButton={false}
          render={<Link href="/assistant" />}
        >
          <MessageCircleMore />
          Assistant
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(true)}>
          Help
        </Button>
        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="icon" aria-label="Notifications" />}>
            <Bell />
          </PopoverTrigger>
          <PopoverContent align="end">
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </PopoverContent>
        </Popover>
        <NavUser email={email} orgName={orgName} avatarUrl={avatarUrl} />
      </div>
    </header>
  )
}
