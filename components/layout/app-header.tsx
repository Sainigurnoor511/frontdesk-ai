'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircleMore, BookOpen, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NavUser } from './nav-user'
import { SidebarToggleButton } from './sidebar-toggle-button'
import { FeedbackDialog } from './feedback-dialog'
import { CommandMenu } from './command-menu'
import { NotificationCenter } from './notification-center'

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
  '/phone-numbers': 'Phone numbers',
  '/business': 'Business',
  '/integrations': 'Integrations',
  '/booking-page': 'Bookings page',
  '/settings': 'Settings',
  '/assistant': 'Assistant',
}

export function AppHeader({
  email,
  orgName,
  avatarUrl,
  businessName,
  unreadNotificationCount,
}: {
  email: string
  orgName: string
  avatarUrl: string | null
  /** Overrides the header title on /business — the page name there is the business's own name, not a static label. */
  businessName?: string
  /** Server-rendered badge seed. Absent where the header is rendered from a client component; the center then fetches once on mount. */
  unreadNotificationCount?: number
}) {
  const pathname = usePathname()
  const section = `/${pathname.split('/')[1] ?? ''}`
  const title = pathname === '/business' && businessName ? businessName : (pageTitles[section] ?? '')
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-2">
      <div className="flex items-center gap-2">
        <SidebarToggleButton className="rounded-md border" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <CommandMenu businessName={businessName} />
        <Button
          variant="outline"
          className="gap-1.5"
          nativeButton={false}
          render={<Link href="/assistant" />}
        >
          <MessageCircleMore />
          Assistant
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>Help</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem render={<Link href="/guides" />}>
              <BookOpen />
              Browse guides
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
              <MessageSquarePlus />
              Give feedback
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
        <NotificationCenter initialUnreadCount={unreadNotificationCount} />
        <NavUser email={email} orgName={orgName} avatarUrl={avatarUrl} />
      </div>
    </header>
  )
}
