'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function FilterMenuButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  title,
  children,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        title={title}
        render={
          <Button
            type="button"
            variant={active ? 'secondary' : 'outline'}
            size="sm"
            disabled={disabled}
            className="gap-1.5"
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        }
      />
      <DropdownMenuContent align="start">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

export function FilterToggleButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  title,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'outline'}
      size="sm"
      disabled={disabled}
      title={title}
      className="gap-1.5"
      onClick={onClick}
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  )
}
