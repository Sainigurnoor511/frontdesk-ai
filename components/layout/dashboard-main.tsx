'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const PAGE_LAYOUT: Record<string, { padding: string; overflow: string }> = {
  '/calendar': { padding: 'p-0', overflow: 'overflow-hidden' },
  '/booking-page': { padding: 'p-2', overflow: 'overflow-hidden' },
}

const DEFAULT_LAYOUT = { padding: 'p-8', overflow: 'overflow-y-auto' }

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const layout = PAGE_LAYOUT[pathname] ?? DEFAULT_LAYOUT

  return (
    <main
      className={cn(
        'scrollbar-thin flex min-h-0 flex-1 flex-col',
        layout.padding,
        layout.overflow
      )}
    >
      {children}
    </main>
  )
}
