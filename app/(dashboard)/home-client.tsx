'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  PlayCircle,
  Phone,
  X,
  CalendarBlank,
  ArrowRight,
} from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
}: {
  href: string
  label: string
  value: string
}) {
  return (
    <Link href={href} className="flex-1">
      <Card className="h-full transition-colors hover:bg-accent">
        <CardContent className="space-y-1 py-4">
          <p className="text-sm text-muted-foreground">{label}</p>
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

  return (
    <div className="space-y-6">
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
        <CardContent className="flex items-center justify-between gap-4 py-5">
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
          <div className="flex shrink-0 items-center gap-2">
            {agent && (
              <Badge variant="secondary" className="gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Receptionist live
              </Badge>
            )}
            <Button size="sm" variant="outline" disabled={!agent} className="gap-1.5">
              <Phone />
              Test it
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4">
        <StatTile href="/analytics?tab=calls" label="Calls (7d)" value={String(metrics.calls)} />
        <StatTile
          href="/analytics?tab=services"
          label="Bookings (7d)"
          value={String(metrics.bookings)}
        />
        <StatTile
          href="/analytics?tab=services"
          label="Revenue (7d)"
          value={`$${metrics.revenue}`}
        />
        <StatTile
          href="/analytics?tab=clients"
          label="New Clients (7d)"
          value={String(metrics.newClients)}
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
