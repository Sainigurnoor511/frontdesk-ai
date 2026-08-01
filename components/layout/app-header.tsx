'use client'

import { usePathname } from 'next/navigation'
import { ChatCircleDots, Bell } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NavUser } from './nav-user'
import { SidebarToggleButton } from './sidebar-toggle-button'

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
  '/integrations': 'Integrations',
  '/booking-page': 'Bookings page',
  '/settings': 'Settings',
  '/phone-numbers': 'Phone numbers',
}

export function AppHeader({ email, orgName }: { email: string; orgName: string }) {
  const pathname = usePathname()
  const title = pageTitles[pathname] ?? ''

  return (
    <header className="flex h-[50px] items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <SidebarToggleButton className="rounded-md border" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5">
          <ChatCircleDots />
          Assistant
        </Button>
        <Button variant="outline" size="sm">
          Help
        </Button>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="icon" aria-label="Notifications" />}>
            <Bell />
          </PopoverTrigger>
          <PopoverContent align="end">
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </PopoverContent>
        </Popover>
        <NavUser email={email} orgName={orgName} />
      </div>
    </header>
  )
}
