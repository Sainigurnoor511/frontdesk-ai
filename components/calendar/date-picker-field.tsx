'use client'

import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

function formatFullDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DatePickerField({
  value,
  onChange,
  className,
}: {
  value: Date
  onChange: (date: Date) => void
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn('w-full justify-start font-normal', className)}
          >
            {formatFullDate(value)}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(next) => {
            if (next) onChange(next)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
