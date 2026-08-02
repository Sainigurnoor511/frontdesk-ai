'use client'

import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

function OpenIcon() {
  return (
    <svg width="20px" height="20px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" color="currentColor" className="size-4">
      <rect x="7" y="6.5" width="7" height="1.5" rx="0.75" transform="rotate(90 7 6.5)" fill="currentColor" />
      <rect x="3" y="4" width="14" height="12" rx="2.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function CollapsedIcon() {
  return (
    <svg width="20px" height="20px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" color="currentColor" className="size-4">
      <rect x="10.5" y="6.5" width="7" height="5" rx="1" transform="rotate(90 10.5 6.5)" fill="currentColor" />
      <rect x="3" y="4" width="14" height="12" rx="2.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function SidebarToggleButton({ className }: { className?: string }) {
  const { state, toggleSidebar } = useSidebar()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle Sidebar"
      className={cn('text-muted-foreground', className)}
      onClick={toggleSidebar}
    >
      {state === 'expanded' ? <OpenIcon /> : <CollapsedIcon />}
    </Button>
  )
}
