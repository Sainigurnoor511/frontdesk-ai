'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
      <DropdownMenuContent align="start" className="min-w-40">
        {children}
      </DropdownMenuContent>
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

export function DateFilterButton({
  icon: Icon,
  label,
  active = false,
  value,
  onChange,
  inputId,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  value: string | null
  onChange: (value: string | null) => void
  inputId: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant={active ? 'secondary' : 'outline'}
            size="sm"
            className="gap-1.5"
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-56 p-2">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <div
            className="px-1.5 pb-2"
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => event.stopPropagation()}
          >
            <Label className="sr-only" htmlFor={inputId}>{label}</Label>
            <Input
              id={inputId}
              type="date"
              value={value ?? ''}
              onChange={(event) => onChange(event.target.value || null)}
            />
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!value} onClick={() => onChange(null)}>
          Clear filter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
