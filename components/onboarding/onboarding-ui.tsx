import { cn } from '@/lib/utils'
import { Logo } from '@/components/brand/logo'

const WIDTHS = {
  sm: 'max-w-[512px]',
  md: 'max-w-[600px]',
  lg: 'max-w-[664px]',
  xl: 'max-w-[800px]',
  '2xl': 'max-w-[960px]',
}

export function OnboardingShell({
  width = 'lg',
  centered = false,
  children,
}: {
  width?: keyof typeof WIDTHS
  centered?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex justify-center px-4 pt-8">
        <Logo className="h-7 w-auto" />
      </header>
      <main
        className={cn(
          'mx-auto flex w-full flex-1 flex-col px-4 pb-16',
          WIDTHS[width],
          centered ? 'justify-center pb-40' : 'pt-16 md:pt-24'
        )}
      >
        {children}
      </main>
    </div>
  )
}

export function StepHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-xl/relaxed text-muted-foreground">{description}</p>}
    </div>
  )
}

export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`Step ${current + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1 rounded-full transition-all duration-300',
            index === current ? 'w-3 bg-foreground' : 'w-1 bg-border'
          )}
        />
      ))}
    </div>
  )
}

export function StepFooter({
  dots,
  children,
}: {
  dots?: { total: number; current: number }
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      {dots ? <StepDots {...dots} /> : <span />}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function ChoiceTile({
  selected,
  className,
  ...props
}: React.ComponentProps<'button'> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex items-center justify-center gap-2.5 rounded-xl border bg-background text-lg font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px',
        selected ? 'border-foreground ring-2 ring-foreground' : 'border-border',
        className
      )}
      {...props}
    />
  )
}

const GRADIENTS = {
  ocean:
    'radial-gradient(at 78% 12%, #6a9a3c 0%, transparent 42%), radial-gradient(at 72% 82%, #4d9fdc 0%, transparent 55%), radial-gradient(at 12% 88%, #0f3550 0%, transparent 52%), radial-gradient(at 18% 14%, #2c6cae 0%, transparent 50%), #1f5482',
  meadow:
    'radial-gradient(at 84% 78%, #e3b92c 0%, transparent 46%), radial-gradient(at 92% 8%, #b9773a 0%, transparent 34%), radial-gradient(at 38% 96%, #86a83c 0%, transparent 42%), radial-gradient(at 18% 26%, #1c3a20 0%, transparent 60%), #31502a',
  forest:
    'radial-gradient(at 10% 90%, #9dba4c 0%, transparent 40%), radial-gradient(at 22% 8%, #2d6fb2 0%, transparent 44%), radial-gradient(at 88% 14%, #6c9a52 0%, transparent 36%), radial-gradient(at 70% 70%, #0d2a22 0%, transparent 62%), #14392e',
}

export type GradientName = keyof typeof GRADIENTS

export function GradientCard({
  gradient,
  icon: Icon,
  label,
  onClick,
}: {
  gradient: GradientName
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex aspect-[5/3] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl text-white outline-none ring-1 ring-foreground/10 ring-offset-2 ring-offset-background transition-transform duration-200 hover:scale-[1.015] focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.99]"
      style={{ background: GRADIENTS[gradient] }}
    >
      <span className="relative flex size-9 items-center justify-center rounded-lg bg-black/25 backdrop-blur-sm">
        <Icon className="size-4.5" />
      </span>
      <span className="relative text-xl font-semibold drop-shadow-sm">{label}</span>
    </button>
  )
}

export function BulletList({
  items,
}: {
  items: { icon: React.ComponentType<{ className?: string }>; text: string }[]
}) {
  return (
    <ul className="space-y-3.5 pt-1">
      {items.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-2.5 text-lg text-muted-foreground">
          <Icon className="size-4.5 shrink-0" />
          {text}
        </li>
      ))}
    </ul>
  )
}
