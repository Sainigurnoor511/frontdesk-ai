'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const FULL_BLEED_PATHS = new Set(['/calendar'])

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const fullBleed = FULL_BLEED_PATHS.has(pathname)

  return (
    <main
      className={cn(
        'scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto',
        fullBleed ? 'p-0' : 'p-8'
      )}
    >
      {children}
    </main>
  )
}
