import { Robot, Question, Bell } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { NavUser } from './nav-user'

export function AppHeader({ email }: { email: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4">
      <SidebarTrigger />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Assistant">
          <Robot />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Help">
          <Question />
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
