'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const GLYPHS = '0123456789'
const SCRAMBLE_STEPS = 9
const SCRAMBLE_INTERVAL_MS = 45

function scramble(value: string, settled: number): string {
  return value
    .split('')
    .map((char, index) =>
      index < settled || !/\d/.test(char)
        ? char
        : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
    )
    .join('')
}

export function MatrixNumber({ value, className }: { value: string; className?: string }) {
  const [shown, setShown] = useState(value)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let step = 0
    const timer = setInterval(() => {
      step += 1
      if (step >= SCRAMBLE_STEPS) {
        clearInterval(timer)
        setShown(value)
        return
      }
      setShown(scramble(value, Math.floor((step / SCRAMBLE_STEPS) * value.length)))
    }, SCRAMBLE_INTERVAL_MS)

    return () => {
      clearInterval(timer)
      setShown(value)
    }
  }, [value])

  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">{shown}</span>
    </span>
  )
}

export function DotColumns({
  data,
  rows = 8,
  className,
}: {
  data: { key: string; value: number; label?: string; title?: string }[]
  rows?: number
  className?: string
}) {
  const max = Math.max(1, ...data.map((item) => item.value))

  return (
    <div className={cn('flex items-end gap-1', className)}>
      {data.map((item, column) => {
        const lit = item.value > 0 ? Math.max(1, Math.round((item.value / max) * rows)) : 0
        return (
          <div
            key={item.key}
            title={item.title}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <div className="flex flex-col-reverse items-center gap-[3px]">
              {Array.from({ length: rows }, (_, row) => (
                <span
                  key={row}
                  className={cn(
                    'dot-rise size-2 rounded-full transition-colors duration-200',
                    row < lit ? 'bg-foreground group-hover:bg-brand' : 'bg-border'
                  )}
                  style={{ animationDelay: `${column * 18 + row * 22}ms` }}
                />
              ))}
            </div>
            {item.label && (
              <span className="max-w-full truncate font-mono text-[0.625rem] text-muted-foreground">
                {item.label}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Loading indicator: a 3x3 dot grid with a wave passing through it.
export function DotLoader({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-grid size-4 grid-cols-3 gap-[2px]', className)}
      {...props}
    >
      {Array.from({ length: 9 }, (_, index) => (
        <span
          key={index}
          className="dot-wave rounded-full bg-current"
          style={{ animationDelay: `${((index % 3) + Math.floor(index / 3)) * 110}ms` }}
        />
      ))}
    </span>
  )
}
