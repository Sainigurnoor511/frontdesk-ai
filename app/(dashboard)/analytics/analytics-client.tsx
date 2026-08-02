'use client'

import { useState, useTransition } from 'react'
import {
  Phone,
  Calendar,
  UserPlus,
  XCircle,
  DollarSign,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Service, BusinessLocation } from '@/lib/data/business'
import type { StaffMember } from '@/lib/data/staff'
import { getAnalyticsForRange, type AnalyticsData, type DateRangeOption } from './actions'

const RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

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

export function AnalyticsClient({
  initialRange,
  initialData,
  services,
  staff,
  locations,
}: {
  initialRange: DateRangeOption
  initialData: AnalyticsData
  services: Service[]
  staff: StaffMember[]
  locations: BusinessLocation[]
}) {
  const [range, setRange] = useState<DateRangeOption>(initialRange)
  const [data, setData] = useState<AnalyticsData>(initialData)
  const [isPending, startTransition] = useTransition()

  function handleRangeChange(value: string | null) {
    const nextRange = (value ?? '7d') as DateRangeOption
    setRange(nextRange)
    startTransition(async () => {
      const result = await getAnalyticsForRange(nextRange)
      if (!('error' in result)) {
        setData(result)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm font-normal text-[#96989d]">Track call volume and performance.</p>
      </div>

      <Tabs defaultValue="overview">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="calls">Calls</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="conversion">Conversion</TabsTrigger>
            <TabsTrigger value="staff-locations">Staff &amp; Locations</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-4">
          <Select value={range} onValueChange={handleRangeChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* TODO: Granularity is UI-only for now — wire up to day/week bucketing in getCallVolumeByDay */}
          <Select defaultValue="day" onValueChange={() => {}}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Granularity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
            </SelectContent>
          </Select>

          {/* TODO: wire these filters up to real filtering logic (channel, location) */}
          <Button type="button" variant="outline" size="sm">
            Channel
          </Button>
          <Button type="button" variant="outline" size="sm">
            Location
          </Button>

          {isPending && <span className="text-sm text-muted-foreground">Loading…</span>}
        </div>

        <TabsContent value="overview" className="space-y-6 pt-4">
          <OverviewTab data={data} />
        </TabsContent>

        <TabsContent value="calls" className="pt-4">
          <CallsTab data={data} />
        </TabsContent>

        <TabsContent value="services" className="pt-4">
          <ServicesTab services={services} />
        </TabsContent>

        <TabsContent value="clients" className="pt-4">
          <ClientsTab data={data} />
        </TabsContent>

        <TabsContent value="conversion" className="pt-4">
          <ConversionTab data={data} />
        </TabsContent>

        <TabsContent value="staff-locations" className="pt-4">
          <StaffLocationsTab staff={staff} locations={locations} />
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

function OverviewTab({ data }: { data: AnalyticsData }) {
  const maxCount = Math.max(1, ...data.callVolume.map((d) => d.count))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Revenue is genuinely $0 — no payments/pricing-per-booking wired up yet. */}
        <MetricTile icon={DollarSign} label="Revenue" value="$0" />
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

          {data.callVolume.every((d) => d.count === 0) ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No calls in this range yet.
            </div>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {data.callVolume.map((day) => (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${day.date}: ${day.count} calls`}
                >
                  <div
                    className="w-full min-w-[4px] rounded-t bg-primary"
                    style={{ height: `${(day.count / maxCount) * 100}%`, minHeight: day.count > 0 ? '4px' : '1px' }}
                  />
                  {data.callVolume.length <= 31 && (
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

function ServicesTab({ services }: { services: Service[] }) {
  if (services.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No services yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* TODO: appointments currently store a free-text `title`, not a service_id FK,
            so booking counts per service can't be derived yet. Once appointments link
            to services by ID, replace the hardcoded "0 bookings" with a real count. */}
        <ul className="divide-y">
          {services.map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-muted-foreground">
                  ${service.price.toFixed(2)} · {service.durationMinutes} min
                </p>
              </div>
              <span className="text-sm text-muted-foreground">0 bookings</span>
            </li>
          ))}
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
}: {
  staff: StaffMember[]
  locations: BusinessLocation[]
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Staff</h3>
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff members yet.</p>
          ) : (
            <>
              {/* TODO: appointments aren't linked to staff by ID yet, so booking
                  counts per staff member can't be derived. Placeholder until that FK exists. */}
              <ul className="divide-y rounded-lg border">
                {staff.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="font-medium">{member.displayName ?? member.fullName}</span>
                    <span className="text-sm text-muted-foreground">0 bookings</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Locations</h3>
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No locations yet.</p>
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
