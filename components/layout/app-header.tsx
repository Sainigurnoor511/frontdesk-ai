import { Bot, HelpCircle, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { NavUser } from './nav-user'

export function AppHeader({ email }: { email: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <SidebarTrigger />
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Assistant">
          <Bot />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Help">
          <HelpCircle />
        </Button>
        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Notifications" />}>
            <Bell />
          </PopoverTrigger>
          <PopoverContent align="end">
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </PopoverContent>
        </Popover>
        <NavUser email={email} />
      </div>
    </header>
  )
}
