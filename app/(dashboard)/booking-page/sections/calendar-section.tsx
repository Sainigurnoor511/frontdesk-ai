'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import type { BusinessProfile } from '@/lib/data/business'
import { updateCalendarConfig } from '../actions'

export function CalendarSection({ businessProfile }: { businessProfile: BusinessProfile }) {
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [slotInterval, setSlotInterval] = useState(businessProfile.bookingSlotIntervalMinutes)
  const [advanceWindow, setAdvanceWindow] = useState(businessProfile.advanceBookingWindowDays)
  const [minimumNotice, setMinimumNotice] = useState(businessProfile.minimumBookingNoticeMinutes)

  const dirty =
    slotInterval !== businessProfile.bookingSlotIntervalMinutes ||
    advanceWindow !== businessProfile.advanceBookingWindowDays ||
    minimumNotice !== businessProfile.minimumBookingNoticeMinutes

  function handleSave() {
    setSaving(true)
    startTransition(async () => {
      const result = await updateCalendarConfig({
        bookingSlotIntervalMinutes: slotInterval,
        advanceBookingWindowDays: advanceWindow,
        minimumBookingNoticeMinutes: minimumNotice,
      })
      setSaving(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Calendar settings saved.')
    })
  }

  function handleCancel() {
    setSlotInterval(businessProfile.bookingSlotIntervalMinutes)
    setAdvanceWindow(businessProfile.advanceBookingWindowDays)
    setMinimumNotice(businessProfile.minimumBookingNoticeMinutes)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Calendar</h2>
        <p className="text-sm text-muted-foreground">
          Controls how the public booking calendar generates available time slots.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-4">
          <div className="space-y-2">
            <Label htmlFor="slot-interval">Slot interval (minutes)</Label>
            <Input
              id="slot-interval"
              type="number"
              min={5}
              max={240}
              value={slotInterval}
              onChange={(e) => setSlotInterval(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advance-window">Advance booking window (days)</Label>
            <Input
              id="advance-window"
              type="number"
              min={1}
              max={365}
              value={advanceWindow}
              onChange={(e) => setAdvanceWindow(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minimum-notice">Minimum booking notice (minutes)</Label>
            <Input
              id="minimum-notice"
              type="number"
              min={0}
              max={10_080}
              value={minimumNotice}
              onChange={(e) => setMinimumNotice(Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </div>
  )
}
