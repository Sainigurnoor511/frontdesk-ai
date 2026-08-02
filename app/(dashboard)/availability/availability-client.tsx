'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CalendarBlank,
  Plus,
  UserGear,
  Cube,
} from '@phosphor-icons/react/dist/ssr'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@/components/ui/empty'
import { updateBusinessHours, createException, deleteException } from './actions'
import type { BusinessHoursRow, ExceptionRow } from '@/lib/data/availability'
import type { BusinessHoursDayInput } from '@/lib/validations/availability'

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const value = `${String(i).padStart(2, '0')}:00`
  return value
})

function toHHMM(time: string | null): string {
  if (!time) return '09:00'
  return time.slice(0, 5)
}

type DayDraft = {
  dayOfWeek: number
  isOpen: boolean
  startTime: string
  endTime: string
}

function rowsToDraft(rows: BusinessHoursRow[]): DayDraft[] {
  return rows.map((row) => ({
    dayOfWeek: row.day_of_week,
    isOpen: row.is_open,
    startTime: toHHMM(row.start_time),
    endTime: toHHMM(row.end_time),
  }))
}

function computeOpenStatus(rows: BusinessHoursRow[]): {
  isOpen: boolean
  label: string
} {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const today = rows.find((r) => r.day_of_week === dayOfWeek)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (today?.is_open && today.start_time && today.end_time) {
    const [startH, startM] = today.start_time.split(':').map(Number)
    const [endH, endM] = today.end_time.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
      return { isOpen: true, label: `Open · closes at ${toHHMM(today.end_time)}` }
    }

    if (nowMinutes < startMinutes) {
      return { isOpen: false, label: `Closed · opens at ${toHHMM(today.start_time)}` }
    }
  }

  // Closed for the rest of today — find the next open day.
  for (let offset = 1; offset <= 7; offset++) {
    const nextDay = (dayOfWeek + offset) % 7
    const next = rows.find((r) => r.day_of_week === nextDay)
    if (next?.is_open && next.start_time) {
      return {
        isOpen: false,
        label: `Closed · opens ${DAY_NAMES[nextDay]} at ${toHHMM(next.start_time)}`,
      }
    }
  }

  return { isOpen: false, label: 'Closed' }
}

function summarizeHours(rows: BusinessHoursRow[]): string {
  const open = rows.filter((r) => r.is_open && r.start_time && r.end_time)
  if (open.length === 0) return 'Closed every day'

  const first = open[0]
  const allSame = open.every(
    (r) => r.start_time === first.start_time && r.end_time === first.end_time
  )

  const dayLabel =
    open.length === 7
      ? 'Monday – Sunday'
      : `${open.length} day${open.length === 1 ? '' : 's'} a week`

  if (allSame) {
    return `${dayLabel} · ${toHHMM(first.start_time)} – ${toHHMM(first.end_time)}`
  }

  return `${dayLabel} · varies by day`
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return startDate === endDate ? fmt(start) : `${fmt(start)} – ${fmt(end)}`
}

export function AvailabilityClient({
  businessHours,
  exceptions,
}: {
  businessHours: BusinessHoursRow[]
  exceptions: ExceptionRow[]
}) {
  const status = useMemo(() => computeOpenStatus(businessHours), [businessHours])
  const summary = useMemo(() => summarizeHours(businessHours), [businessHours])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Availability</h1>
        <p className="mt-1 text-sm font-normal text-[#96989d]">
          Set when you accept bookings, plus any one-off exceptions.
        </p>
      </div>

      <Tabs defaultValue="business">
        <TabsList>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="space-y-6 pt-4">
          <Card>
            <CardContent className="flex items-center gap-2 py-4">
              <span
                className={`size-2 shrink-0 rounded-full ${
                  status.isOpen ? 'bg-green-500' : 'bg-muted-foreground'
                }`}
              />
              <p className="text-sm font-medium">{status.label}</p>
            </CardContent>
          </Card>

          <BusinessHoursSection businessHours={businessHours} summary={summary} />

          <ExceptionsSection exceptions={exceptions} />
        </TabsContent>

        <TabsContent value="staff" className="pt-4">
          {/* Full per-staff hours editing is a later phase; this is a gated empty state for now. */}
          <Card>
            <CardContent className="py-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserGear />
                  </EmptyMedia>
                  <EmptyTitle>No staff yet</EmptyTitle>
                  <EmptyDescription>
                    Add staff members to set per-person availability and time off.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button size="sm" nativeButton={false} render={<Link href="/staff" />}>
                    Manage staff
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="pt-4">
          {/* Per-asset availability is a later phase; this is a gated empty state for now. */}
          <Card>
            <CardContent className="py-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Cube />
                  </EmptyMedia>
                  <EmptyTitle>No assets yet</EmptyTitle>
                  <EmptyDescription>
                    Add assets in Business settings to set per-asset availability.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/business?tab=assets" />}
                  >
                    Go to Business settings
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BusinessHoursSection({
  businessHours,
  summary,
}: {
  businessHours: BusinessHoursRow[]
  summary: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DayDraft[]>(() => rowsToDraft(businessHours))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const openDialog = () => {
    setDraft(rowsToDraft(businessHours))
    setError(null)
    setOpen(true)
  }

  const updateDay = (dayOfWeek: number, patch: Partial<DayDraft>) => {
    setDraft((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d))
    )
  }

  const handleSave = () => {
    setError(null)
    const payload: BusinessHoursDayInput[] = draft.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isOpen: d.isOpen,
      startTime: d.startTime,
      endTime: d.endTime,
    }))

    startTransition(async () => {
      const result = await updateBusinessHours(payload)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setOpen(false)
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Business hours</h2>
            <p className="text-sm text-muted-foreground">
              Your default booking window plus any one-off exceptions.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button variant="outline" onClick={openDialog} />}>
              Edit hours
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit business hours</DialogTitle>
                <DialogDescription>
                  Set your default booking window for each day of the week.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {draft.map((day) => (
                  <div key={day.dayOfWeek} className="flex items-center gap-3">
                    <div className="flex w-28 shrink-0 items-center gap-2">
                      <Switch
                        checked={day.isOpen}
                        onCheckedChange={(checked) =>
                          updateDay(day.dayOfWeek, { isOpen: Boolean(checked) })
                        }
                      />
                      <Label className="text-sm font-normal">
                        {DAY_NAMES[day.dayOfWeek]}
                      </Label>
                    </div>

                    {day.isOpen ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Select
                          value={day.startTime}
                          onValueChange={(value) =>
                            updateDay(day.dayOfWeek, { startTime: value as string })
                          }
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HOUR_OPTIONS.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground">–</span>
                        <Select
                          value={day.endTime}
                          onValueChange={(value) =>
                            updateDay(day.dayOfWeek, { endTime: value as string })
                          }
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HOUR_OPTIONS.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Add another time range"
                          onClick={() => {
                            // TODO: support split shifts (a second time range per day)
                          }}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="flex-1 text-sm text-muted-foreground">Closed</p>
                    )}
                  </div>
                ))}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isPending}>
                  {isPending ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <p className="text-sm">{summary}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ExceptionsSection({ exceptions }: { exceptions: ExceptionRow[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Upcoming exceptions</h2>
            <p className="text-sm text-muted-foreground">
              Closures and one-off custom hours.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button variant="outline" />}>Add exception</DialogTrigger>
            <AddExceptionDialog onClose={() => setOpen(false)} />
          </Dialog>
        </div>

        {exceptions.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarBlank />
              </EmptyMedia>
              <EmptyTitle>No upcoming exceptions</EmptyTitle>
              <EmptyDescription>
                Add one for holidays, custom hours, or when someone is away.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y rounded-lg border">
            {exceptions.map((exception) => (
              <li
                key={exception.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium">{exception.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateRange(exception.start_date, exception.end_date)}
                    {exception.type === 'custom_hours' &&
                    exception.start_time &&
                    exception.end_time
                      ? ` · ${toHHMM(exception.start_time)} – ${toHHMM(exception.end_time)}`
                      : ' · Closed all day'}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {exception.type === 'closed' ? 'Closed' : 'Custom hours'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AddExceptionDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'closed' | 'custom_hours'>('closed')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Date pickers are styled placeholders for this pass; both default to today.
  const today = new Date().toISOString().slice(0, 10)

  const handleAdd = () => {
    setError(null)
    startTransition(async () => {
      const result = await createException({
        name,
        type,
        startDate: today,
        endDate: today,
        reason: reason || undefined,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setName('')
      setType('closed')
      setReason('')
      onClose()
    })
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add exception</DialogTitle>
        <DialogDescription>
          Schedule a closure or custom hours for a specific date range.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            placeholder="e.g., Christmas Day, Staff Training"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="closed">Closed all day</SelectItem>
              <SelectItem value="custom_hours">Custom hours</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Button variant="outline" className="w-full justify-start font-normal" type="button">
              <CalendarBlank className="size-4" />
              {today}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>End date</Label>
            <Button variant="outline" className="w-full justify-start font-normal" type="button">
              <CalendarBlank className="size-4" />
              {today}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Reason (optional)</Label>
          <Input
            placeholder="e.g., Vacation, Renovation, Sick leave"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleAdd} disabled={isPending || !name.trim()}>
          {isPending ? 'Adding...' : 'Add'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
