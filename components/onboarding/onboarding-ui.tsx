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
    <div className="bg-dots flex min-h-dvh flex-col">
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
            'size-1.5 rounded-full transition-colors duration-300',
            index === current ? 'bg-brand' : index < current ? 'bg-foreground' : 'bg-border'
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
        'flex items-center justify-center gap-2.5 rounded-lg border bg-background text-lg font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px',
        selected ? 'border-foreground ring-2 ring-foreground shadow-[inset_0_-3px_0_var(--brand)]' : 'border-border',
        className
      )}
      {...props}
    />
  )
}

const PATTERN_PITCH = { fine: 10, medium: 16, wide: 24 }

export type PatternName = keyof typeof PATTERN_PITCH

export function PatternCard({
  pattern,
  icon: Icon,
  label,
  onClick,
}: {
  pattern: PatternName
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  const pitch = PATTERN_PITCH[pattern]

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex aspect-[5/3] w-full flex-col justify-between overflow-hidden rounded-lg bg-primary p-5 text-left text-primary-foreground outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/60 active:translate-y-0"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 opacity-25 transition-opacity duration-200 group-hover:opacity-45"
        style={{
          backgroundImage: 'radial-gradient(currentColor 1.5px, transparent 1.7px)',
          backgroundSize: `${pitch}px ${pitch}px`,
          maskImage: 'linear-gradient(135deg, transparent 15%, black 90%)',
        }}
      />
      <span className="relative flex size-9 items-center justify-center rounded-sm bg-brand text-brand-foreground">
        <Icon className="size-4.5" />
      </span>
      <span className="relative text-xl font-semibold">{label}</span>
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
