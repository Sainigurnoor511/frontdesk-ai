'use client'

import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logOut } from '@/app/(auth)/actions'

const INCLUDED_MINUTES = 30
const USED_MINUTES = 0
const remainingMinutes = INCLUDED_MINUTES - USED_MINUTES
const usedPercent = Math.round((USED_MINUTES / INCLUDED_MINUTES) * 100)

function UsageRing({ percent }: { percent: number }) {
  const radius = 15
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percent / 100)

  return (
    <div className="relative flex size-9 items-center justify-center">
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="hsl(0deg 0% 90%)"
          strokeWidth="2.5"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="hsl(0deg 0% 20%)"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[9px] font-medium">{percent}%</span>
    </div>
  )
}

export function NavUser({ email, orgName }: { email: string; orgName: string }) {
  const name = email.split('@')[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <UsageRing percent={usedPercent} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{orgName}</p>
        </div>
        <DropdownMenuSeparator />
        <div className="space-y-2 px-2 py-2">
          <p className="text-sm font-medium">Balance</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Included usage</span>
            <span>{INCLUDED_MINUTES} min</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Remaining</span>
            <span>{remainingMinutes} min</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>Settings</DropdownMenuItem>
        <DropdownMenuItem disabled>Dark mode (coming soon)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logOut()}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
