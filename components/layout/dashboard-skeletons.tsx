import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function SkeletonPageHeader({
  withDescription = true,
  withActions = false,
  className,
}: {
  withDescription?: boolean
  withActions?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        {withDescription && <Skeleton className="h-4 w-72 max-w-full" />}
      </div>
      {withActions && (
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
        </div>
      )}
    </div>
  )
}

export function SkeletonLineTabs({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b pb-3">
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton key={index} className="h-5 w-20" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

export function SkeletonSearchRow({ withButton = true }: { withButton?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Skeleton className="h-9 w-full max-w-sm" />
      {withButton && <Skeleton className="h-9 w-28" />}
    </div>
  )
}

export function SkeletonFilterChips({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-8 w-24 rounded-full" />
      ))}
    </div>
  )
}

export function SkeletonListRows({
  rows = 6,
  inCard = true,
}: {
  rows?: number
  inCard?: boolean
}) {
  const content = (
    <ul className={cn(inCard && 'divide-y')}>
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
        </li>
      ))}
    </ul>
  )

  if (!inCard) return content

  return (
    <Card>
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  )
}

export function SkeletonMetricGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3 py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function SkeletonFormCard() {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-2 border-b pb-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full" />
        </div>
      </CardContent>
    </Card>
  )
}

export function SkeletonChatMessages({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn('flex', index % 2 === 0 ? 'justify-end' : 'justify-start')}
        >
          <Skeleton
            className={cn(
              'h-12 rounded-2xl',
              index % 2 === 0 ? 'w-48 rounded-br-sm' : 'h-16 w-full max-w-md'
            )}
          />
        </div>
      ))}
    </div>
  )
}

export function SkeletonSidebarList({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="space-y-1">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="rounded-lg px-2 py-2">
          <Skeleton className="h-4 w-full max-w-[10rem]" />
          <Skeleton className="mt-1.5 h-3 w-16" />
        </li>
      ))}
    </ul>
  )
}

/** Home dashboard */
export function HomePageSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-9 w-40 rounded-full" />
        </CardContent>
      </Card>

      <SkeletonMetricGrid count={4} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <SkeletonListRows rows={4} inCard={false} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-16" />
            </div>
            <SkeletonListRows rows={4} inCard={false} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Conversations, messages tabs */
export function ConversationsPageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader withDescription />
      <SkeletonLineTabs count={2} />
      <div className="space-y-4">
        <SkeletonSearchRow withButton={false} />
        <SkeletonFilterChips />
        <SkeletonListRows rows={8} />
      </div>
    </div>
  )
}

/** Clients, staff list pages */
export function TablePageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader withDescription withActions />
      <SkeletonSearchRow />
      <SkeletonListRows rows={8} />
    </div>
  )
}

/** Business, analytics, availability tabbed pages */
export function TabsPageSkeleton({ tabs = 5 }: { tabs?: number }) {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader withDescription />
      <SkeletonLineTabs count={tabs} />
    </div>
  )
}

/** Integrations grid */
export function IntegrationsPageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader withDescription withActions />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <Card>
        <CardContent className="space-y-6 py-10">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-lg" />
            ))}
          </div>
          <div className="flex justify-center">
            <Skeleton className="h-9 w-40" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** Full-height calendar */
export function CalendarPageSkeleton() {
  return (
    <div className="flex h-[calc(100svh-50px)] min-h-0 flex-col">
      <div className="flex h-[44.8px] shrink-0 items-center justify-end gap-2 border-b px-2.5">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex-1 p-2">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    </div>
  )
}

/** Booking page editor */
export function BookingPageSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <Skeleton className="h-80 w-12 shrink-0 rounded-md" />
        <Skeleton className="min-h-0 flex-1 rounded-lg" />
        <Skeleton className="min-h-0 flex-1 rounded-lg" />
      </div>
    </div>
  )
}

/** Assistant with chat sidebar */
export function AssistantPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 gap-4">
      <aside className="flex w-56 shrink-0 flex-col gap-2 border-r pr-3">
        <Skeleton className="h-9 w-full" />
        <SkeletonSidebarList rows={6} />
      </aside>
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-8 w-64" />
          <Skeleton className="mx-auto h-4 w-48" />
        </div>
        <Skeleton className="h-28 w-full max-w-2xl rounded-3xl" />
      </div>
    </div>
  )
}

/** Agent detail with tabs */
export function AgentDetailPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <SkeletonLineTabs count={5} />
    </div>
  )
}

/** Simple form pages */
export function FormPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SkeletonPageHeader withDescription />
      <SkeletonFormCard />
    </div>
  )
}

/** Guides / placeholder pages */
export function GuidesPageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader withDescription />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

/** Inline audio / recording loader */
export function SkeletonRecordingPlayer() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-3">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <Skeleton className="h-2 flex-1 rounded-full" />
      <Skeleton className="h-4 w-12" />
    </div>
  )
}

/** History / version list */
export function SkeletonVersionList({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex items-center justify-between gap-4 px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-20" />
        </li>
      ))}
    </ul>
  )
}
