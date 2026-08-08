'use client'

import { useState, useTransition } from 'react'
import {
  Phone,
  Calendar,
  UserPlus,
  XCircle,
  DollarSign,
  Store,
  UserCog,
  MapPin,
  BarChart3,
  Radio,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { FilterMenuButton, FilterToggleButton } from '@/components/layout/filter-menu-button'
import type { Service, BusinessLocation } from '@/lib/data/business'
import type { StaffMember } from '@/lib/data/staff'
import { getAnalyticsForRange, type AnalyticsData, type AnalyticsChannel, type DateRangeOption } from './actions'

const RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

const TAB_VALUES = [
  'overview',
  'calls',
  'services',
  'clients',
  'conversion',
  'staff-locations',
] as const

type AnalyticsTab = (typeof TAB_VALUES)[number]

function formatDuration(seconds: number) {
  if (seconds <= 0) return '0s'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}

function formatDayLabel(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00.000Z`)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function aggregateVolumeByWeek(
  callVolume: AnalyticsData['callVolume']
): AnalyticsData['callVolume'] {
  const buckets = new Map<string, number>()

  for (const day of callVolume ?? []) {
    if (!day) continue
    const date = new Date(`${day.date}T00:00:00.000Z`)
    const dayOfWeek = date.getUTCDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(date)
    weekStart.setUTCDate(date.getUTCDate() + mondayOffset)
    const key = weekStart.toISOString().slice(0, 10)
    buckets.set(key, (buckets.get(key) ?? 0) + (day.count ?? 0))
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
}

const CHANNEL_OPTIONS: { value: AnalyticsChannel; label: string }[] = [
  { value: 'all', label: 'All channels' },
  { value: 'voice_web', label: 'Web calls' },
  { value: 'phone', label: 'Phone' },
  { value: 'chat', label: 'Chat' },
]

export function AnalyticsClient({
  initialRange,
  initialTab,
  initialData,
  services,
  staff,
  locations,
}: {
  initialRange: DateRangeOption
  initialTab?: string
  initialData: AnalyticsData
  services: Service[]
  staff: StaffMember[]
  locations: BusinessLocation[]
}) {
  const [range, setRange] = useState<DateRangeOption>(initialRange)
  const [data, setData] = useState<AnalyticsData>(initialData)
  const [channel, setChannel] = useState<AnalyticsChannel>('all')
  const [granularity, setGranularity] = useState<'day' | 'week'>('day')
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<AnalyticsTab>(
    TAB_VALUES.includes(initialTab as AnalyticsTab)
      ? (initialTab as AnalyticsTab)
      : 'overview'
  )

  function refreshAnalytics(nextRange: DateRangeOption, nextChannel: AnalyticsChannel) {
    startTransition(async () => {
      const result = await getAnalyticsForRange(nextRange, nextChannel)
      if (!('error' in result)) {
        setData(result)
      }
    })
  }

  function handleRangeChange(value: string | null) {
    const nextRange = (value ?? '7d') as DateRangeOption
    setRange(nextRange)
    refreshAnalytics(nextRange, channel)
  }

  function handleChannelChange(value: string | null) {
    const nextChannel = (value ?? 'all') as AnalyticsChannel
    setChannel(nextChannel)
    refreshAnalytics(range, nextChannel)
  }

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold">Analytics</h1>

      <Tabs value={tab} onValueChange={(value) => setTab(value as AnalyticsTab)}>
        <TabsList variant="line" className="w-full justify-start gap-1 border-b [&>*]:flex-none">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="conversion">Conversion</TabsTrigger>
          <TabsTrigger value="staff-locations">Staff &amp; Locations</TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap items-center gap-2 pt-6">
          <FilterMenuButton icon={Calendar} label="Range" active={range !== '30d'}>
            {RANGE_OPTIONS.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => handleRangeChange(option.value)}>
                {option.label}
              </DropdownMenuItem>
            ))}
          </FilterMenuButton>

          <FilterMenuButton icon={BarChart3} label="Granularity" active={granularity !== 'day'}>
            <DropdownMenuItem onClick={() => setGranularity('day')}>Day</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGranularity('week')}>Week</DropdownMenuItem>
          </FilterMenuButton>

          <FilterMenuButton icon={Radio} label="Channel" active={channel !== 'all'}>
            {CHANNEL_OPTIONS.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => handleChannelChange(option.value)}>
                {option.label}
              </DropdownMenuItem>
            ))}
          </FilterMenuButton>

          <FilterToggleButton
            icon={MapPin}
            label="Location"
            disabled
            title="Location-level analytics will appear once appointments are linked to business locations"
            onClick={() => undefined}
          />

          {isPending && <Skeleton className="h-4 w-20" />}
        </div>

        <TabsContent value="overview" className="space-y-6 pt-4">
          <OverviewTab data={data} granularity={granularity} />
        </TabsContent>

        <TabsContent value="calls" className="pt-4">
          <CallsTab data={data} />
        </TabsContent>

        <TabsContent value="services" className="pt-4">
          <ServicesTab services={services} bookingCounts={data.bookingCountsByService} />
        </TabsContent>

        <TabsContent value="clients" className="pt-4">
          <ClientsTab data={data} />
        </TabsContent>

        <TabsContent value="conversion" className="pt-4">
          <ConversionTab data={data} />
        </TabsContent>

        <TabsContent value="staff-locations" className="pt-4">
          <StaffLocationsTab
            staff={staff}
            locations={locations}
            bookingCounts={data.bookingCountsByStaff}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------- Overview Tab ----------------

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <p className="text-sm">{label}</p>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function OverviewTab({
  data,
  granularity,
}: {
  data: AnalyticsData
  granularity: 'day' | 'week'
}) {
  const rawVolume = data.callVolume ?? []
  const callVolume =
    granularity === 'week' ? aggregateVolumeByWeek(rawVolume) : rawVolume
  const maxCount = Math.max(1, ...callVolume.map((d) => d?.count ?? 0))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile
          icon={DollarSign}
          label="Revenue"
          value={`$${data.overview.revenue.toFixed(2)}`}
        />
        <MetricTile icon={Calendar} label="Bookings" value={data.overview.bookings} />
        <MetricTile icon={UserPlus} label="New Clients" value={data.overview.newClients} />
        <MetricTile icon={XCircle} label="Cancellations" value={data.overview.cancellations} />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold">Call volume</h3>
            <p className="text-sm text-muted-foreground">Calls per day over the selected range.</p>
          </div>

          {callVolume.every((d) => (d?.count ?? 0) === 0) ? (
            <Empty className="border-0 py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Phone />
                </EmptyMedia>
                <EmptyTitle>No calls in this range yet</EmptyTitle>
                <EmptyDescription>
                  Call volume will appear here once you receive calls.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {callVolume.map((day) => (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${day.date}: ${day.count ?? 0} calls`}
                >
                  <div
                    className="w-full min-w-[4px] rounded-t bg-primary"
                    style={{
                      height: `${((day.count ?? 0) / maxCount) * 100}%`,
                      minHeight: (day.count ?? 0) > 0 ? '4px' : '1px',
                    }}
                  />
                  {callVolume.length <= 31 && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDayLabel(day.date)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------- Calls Tab ----------------

function CallsTab({ data }: { data: AnalyticsData }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricTile icon={Phone} label="Total Calls" value={data.callStats.totalCalls} />
      <MetricTile icon={Phone} label="Successful" value={data.callStats.successfulCalls} />
      <MetricTile icon={Phone} label="Failed" value={data.callStats.failedCalls} />
      <MetricTile
        icon={Phone}
        label="Avg Duration"
        value={formatDuration(data.callStats.averageDurationSeconds)}
      />
    </div>
  )
}

// ---------------- Services Tab ----------------

function ServicesTab({
  services,
  bookingCounts,
}: {
  services: Service[]
  bookingCounts: Record<string, number>
}) {
  if (services.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <Empty className="border-0 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Store />
              </EmptyMedia>
              <EmptyTitle>No services yet</EmptyTitle>
              <EmptyDescription>
                Add services in Business to see booking analytics per service.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {services.map((service) => {
            const count = bookingCounts[service.id] ?? 0
            return (
            <li key={service.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-muted-foreground">
                  ${service.price.toFixed(2)} · {service.durationMinutes} min
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {count} booking{count === 1 ? '' : 's'}
              </span>
            </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------------- Clients Tab ----------------

function ClientsTab({ data }: { data: AnalyticsData }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricTile icon={UserPlus} label="Total Clients" value={data.clientStats.totalClients} />
      <MetricTile icon={UserPlus} label="New Clients" value={data.clientStats.newClients} />
    </div>
  )
}

// ---------------- Conversion Tab ----------------

function ConversionTab({ data }: { data: AnalyticsData }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricTile
        icon={Calendar}
        label="Call → Booking Rate"
        value={`${data.conversionRate.toFixed(1)}%`}
      />
    </div>
  )
}

// ---------------- Staff & Locations Tab ----------------

function StaffLocationsTab({
  staff,
  locations,
  bookingCounts,
}: {
  staff: StaffMember[]
  locations: BusinessLocation[]
  bookingCounts: Record<string, number>
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Staff</h3>
          {staff.length === 0 ? (
            <Empty className="border-0 py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserCog />
                </EmptyMedia>
                <EmptyTitle>No staff members yet</EmptyTitle>
                <EmptyDescription>
                  Add staff to track bookings per team member.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ul className="divide-y rounded-lg border">
                {staff.map((member) => {
                  const count = bookingCounts[member.id] ?? 0
                  return (
                  <li key={member.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="font-medium">{member.displayName ?? member.fullName}</span>
                    <span className="text-sm text-muted-foreground">
                      {count} booking{count === 1 ? '' : 's'}
                    </span>
                  </li>
                  )
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Locations</h3>
          {locations.length === 0 ? (
            <Empty className="border-0 py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MapPin />
                </EmptyMedia>
                <EmptyTitle>No locations yet</EmptyTitle>
                <EmptyDescription>
                  Add business locations to see them here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y rounded-lg border">
              {locations.map((location) => (
                <li key={location.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="font-medium">{location.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {location.isActive ? 'Active' : 'Inactive'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
