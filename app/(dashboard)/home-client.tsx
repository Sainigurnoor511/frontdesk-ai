'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  PlayCircle,
  Phone,
  X,
  CalendarBlank,
  ArrowRight,
  CalendarCheck,
  TrendUp,
  UserPlus,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon } from '@phosphor-icons/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Orb } from '@/components/ui/orb'
import { CallDialog } from '@/components/voice/call-dialog'
import type { Agent } from '@/lib/data/agents'
import type { Conversation } from '@/lib/data/conversations'
import type { AppointmentRow } from '@/lib/data/calendar'

type Metrics = {
  calls: number
  bookings: number
  revenue: number
  newClients: number
}

function StatTile({
  href,
  label,
  value,
  icon: TileIcon,
}: {
  href: string
  label: string
  value: string
  icon: Icon
}) {
  return (
    <Link href={href} className="flex-1">
      <Card className="h-full transition-colors hover:bg-accent">
        <CardContent className="space-y-1 py-4">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <TileIcon className="size-4" />
            {label}
          </p>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">no prior data</p>
        </CardContent>
      </Card>
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
  latestCalls,
  upcomingAppointments,
}: {
  agent: Agent | null
  metrics: Metrics
  latestCalls: Conversation[]
  upcomingAppointments: AppointmentRow[]
}) {
  const [dismissed, setDismissed] = useState(false)
  const [callOpen, setCallOpen] = useState(false)

  return (
    <div className="space-y-6">
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
              <Button variant="outline" size="sm" className="gap-1.5">
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
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-9 shrink-0 overflow-hidden rounded-full border border-foreground/10 sm:size-11">
              <Orb seed={1} />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold">
                {agent ? (agent.business_name ?? agent.name) : 'Your Business'}
              </h2>
              {agent?.staff_phone_number ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="size-3.5" />
                  {agent.staff_phone_number}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link
                    href="/phone-numbers"
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
                aria-label="Test your receptionist"
                onClick={() => setCallOpen(true)}
                className="group flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-background px-4 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
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
          agentName={agent.business_name ?? agent.name}
          staffPhoneNumber={agent.staff_phone_number}
          authenticated
        />
      )}

      <div className="flex flex-wrap gap-4">
        <StatTile
          href="/analytics?tab=calls"
          label="Calls (7d)"
          value={String(metrics.calls)}
          icon={Phone}
        />
        <StatTile
          href="/analytics?tab=services"
          label="Bookings (7d)"
          value={String(metrics.bookings)}
          icon={CalendarCheck}
        />
        <StatTile
          href="/analytics?tab=services"
          label="Revenue (7d)"
          value={`$${metrics.revenue}`}
          icon={TrendUp}
        />
        <StatTile
          href="/analytics?tab=clients"
          label="New Clients (7d)"
          value={String(metrics.newClients)}
          icon={UserPlus}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Latest Calls</h2>
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
              <>
                <p className="text-sm text-muted-foreground">
                  No calls yet. Your recent calls will appear here.
                </p>
                <Link
                  href="/phone-numbers"
                  className="text-sm font-medium text-foreground underline underline-offset-4"
                >
                  Start receiving calls
                </Link>
              </>
            ) : (
              <ul className="divide-y">
                {latestCalls.map((call) => (
                  <li key={call.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">
                        {formatRelativeDate(call.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(call.durationSeconds)}
                      </span>
                      <Badge variant={call.outcome === 'successful' ? 'secondary' : 'destructive'}>
                        {call.outcome === 'successful' ? 'Successful' : 'Failed'}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Upcoming Events</h2>
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
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CalendarBlank className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No upcoming events this week.</p>
                <Link
                  href="/calendar"
                  className="text-sm font-medium text-foreground underline underline-offset-4"
                >
                  Open Calendar
                </Link>
              </div>
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
