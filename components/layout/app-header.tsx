'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircleMore, Bell, BookOpen, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NavUser } from './nav-user'
import { SidebarToggleButton } from './sidebar-toggle-button'
import { FeedbackDialog } from './feedback-dialog'
import { CommandMenu } from './command-menu'

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
}: {
  email: string
  orgName: string
  avatarUrl: string | null
  /** Overrides the header title on /business — the page name there is the business's own name, not a static label. */
  businessName?: string
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
