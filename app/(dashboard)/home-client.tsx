'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PlayCircle,
  Phone,
  X,
  CalendarDays,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  CalendarCheck,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { Orb } from '@/components/ui/orb'
import { MatrixNumber } from '@/components/ui/matrix'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { CallDialog } from '@/components/voice/call-dialog'
import { ConversationStatusBadge } from '@/components/conversations/conversation-status-badge'
import type { Agent } from '@/lib/data/agents'
import type { Conversation } from '@/lib/data/conversations'
import type { AppointmentRow } from '@/lib/data/calendar'

type Metrics = {
  calls: number
  bookings: number
  revenue: number
  newClients: number
}

type Trend = { label: string; direction: 'up' | 'down' | 'flat' }

function getTrend(current: number, prior: number): Trend {
  if (current === 0 && prior === 0) return { label: 'No activity yet', direction: 'flat' }
  if (prior === 0) return { label: 'New this week', direction: 'up' }
  const change = Math.round(((current - prior) / prior) * 100)
  if (change === 0) return { label: 'Same as last week', direction: 'flat' }
  return {
    label: `${Math.abs(change)}% vs last week`,
    direction: change > 0 ? 'up' : 'down',
  }
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function StatTile({
  href,
  label,
  value,
  trend,
  icon: TileIcon,
}: {
  href: string
  label: string
  value: string
  trend: Trend
  icon: LucideIcon
}) {
  const TrendIcon = trend.direction === 'up' ? ArrowUpRight : ArrowDownRight
  return (
    <Link
      href={href}
      className="lift group rounded-lg bg-card px-4 py-3.5 ring-1 ring-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <p className="label-mono flex items-center gap-1.5 text-muted-foreground">
        <TileIcon className="size-3.5" />
        {label}
      </p>
      <MatrixNumber value={value} className="mt-2 block font-mono text-3xl font-medium tracking-tight" />
      <p
        className={cn(
          'mt-1 flex items-center gap-0.5 text-xs',
          trend.direction === 'up' && 'text-success',
          trend.direction === 'down' && 'text-danger',
          trend.direction === 'flat' && 'text-muted-foreground'
        )}
      >
        {trend.direction !== 'flat' && (
          <>
            <TrendIcon className="size-3" aria-hidden="true" />
            <span className="sr-only">{trend.direction === 'up' ? 'Up' : 'Down'}</span>
          </>
        )}
        {trend.label}
      </p>
    </Link>
  )
}

function formatRelativeDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${String(remaining).padStart(2, '0')} min`
}

export function HomeClient({
  agent,
  metrics,
  priorMetrics,
  latestCalls,
  upcomingAppointments,
}: {
  agent: Agent | null
  metrics: Metrics
  priorMetrics: Metrics
  latestCalls: Conversation[]
  upcomingAppointments: AppointmentRow[]
}) {
  const [dismissed, setDismissed] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="space-y-5">
      <h1 className="font-heading text-2xl font-semibold">Home</h1>

      {!agent && !dismissed && (
        <Card className="relative">
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
          >
            <X />
          </Button>
          <CardContent className="space-y-3 py-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Getting started
            </p>
            <h2 className="text-lg font-semibold">Learn the app in minutes</h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              Watch a quick walkthrough, then explore friendly guides from adding services to
              managing your calendar.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                nativeButton={false}
                render={<Link href="/guides" />}
              >
                <PlayCircle />
                Watch video
              </Button>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/guides" />}
              >
                Browse guides
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-9 shrink-0 sm:size-11">
              <Orb className="h-full w-full" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold">{agent?.name ?? 'Your receptionist'}</h2>
              {agent?.staff_phone_number ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="size-3.5" />
                  {agent.staff_phone_number}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link
                    href={agent ? `/agents/${agent.id}?tab=call-settings` : '/agents'}
                    className="text-foreground underline underline-offset-4"
                  >
                    Add a phone number
                  </Link>{' '}
                  to start taking calls.
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {agent ? (
              <button
                type="button"
                onClick={() => setCallOpen(true)}
                className="group flex shrink-0 items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <p className="text-sm font-medium text-foreground">Receptionist live</p>
                <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5" />
                  <p className="text-sm font-medium text-foreground">Test it</p>
                </span>
              </button>
            ) : (
              <Button size="sm" variant="outline" disabled className="gap-1.5">
                <Phone />
                Test it
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {agent && (
        <CallDialog
          open={callOpen}
          onOpenChange={setCallOpen}
          organizationId={agent.organization_id}
          agentId={agent.id}
          agentName={agent.name}
          staffPhoneNumber={agent.staff_phone_number}
          authenticated
        />
      )}

      <div className="stagger-in grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          href="/analytics?tab=calls"
          label="Calls this week"
          value={String(metrics.calls)}
          trend={getTrend(metrics.calls, priorMetrics.calls)}
          icon={Phone}
        />
        <StatTile
          href="/analytics?tab=services"
          label="Bookings this week"
          value={String(metrics.bookings)}
          trend={getTrend(metrics.bookings, priorMetrics.bookings)}
          icon={CalendarCheck}
        />
        <StatTile
          href="/analytics?tab=services"
          label="Revenue this week"
          value={currencyFormatter.format(metrics.revenue)}
          trend={getTrend(metrics.revenue, priorMetrics.revenue)}
          icon={TrendingUp}
        />
        <StatTile
          href="/analytics?tab=clients"
          label="New clients this week"
          value={String(metrics.newClients)}
          trend={getTrend(metrics.newClients, priorMetrics.newClients)}
          icon={UserPlus}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Latest calls</h2>
              {latestCalls.length > 0 && (
                <Link
                  href="/conversations"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  View all
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
            {latestCalls.length === 0 ? (
              <Empty className="border-0 py-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Phone />
                  </EmptyMedia>
                  <EmptyTitle>No calls yet</EmptyTitle>
                  <EmptyDescription>
                    Your recent calls will appear here.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Link
                    href={agent ? `/agents/${agent.id}?tab=call-settings` : '/agents'}
                    className="text-sm font-medium text-foreground underline underline-offset-4"
                  >
                    Start receiving calls
                  </Link>
                </EmptyContent>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestCalls.map((call) => (
                    <TableRow
                      key={call.id}
                      onClick={() => router.push('/conversations')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') router.push('/conversations')
                      }}
                      tabIndex={0}
                      aria-label={`Open call from ${formatRelativeDate(call.createdAt)}`}
                      className="cursor-pointer outline-none focus-visible:bg-muted"
                    >
                      <TableCell className="text-muted-foreground">
                        {formatRelativeDate(call.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDuration(call.durationSeconds)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ConversationStatusBadge outcome={call.outcome} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Upcoming appointments</h2>
              {upcomingAppointments.length > 0 && (
                <Link
                  href="/calendar"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  View all
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
            {upcomingAppointments.length === 0 ? (
              <Empty className="border-0 py-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarDays />
                  </EmptyMedia>
                  <EmptyTitle>No appointments this week</EmptyTitle>
                  <EmptyDescription>
                    Appointments on your calendar will show up here.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Link
                    href="/calendar"
                    className="text-sm font-medium text-foreground underline underline-offset-4"
                  >
                    Open calendar
                  </Link>
                </EmptyContent>
              </Empty>
            ) : (
              <ul className="divide-y">
                {upcomingAppointments.map((appt) => (
                  <li key={appt.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{appt.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{appt.client_name}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeDate(appt.starts_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
