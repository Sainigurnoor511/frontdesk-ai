'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { updateConfirmationRules } from '../actions'

export function ChecklistSection({ config }: { config: BookingPageConfig }) {
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [requireEmailVerification, setRequireEmailVerification] = useState(config.requireEmailVerification)
  const [autoConfirmBookings, setAutoConfirmBookings] = useState(config.autoConfirmBookings)
  const [cancellationPolicyText, setCancellationPolicyText] = useState(config.cancellationPolicyText ?? '')
  const [cancellationNoticeHours, setCancellationNoticeHours] = useState(config.cancellationNoticeHours)

  const dirty =
    requireEmailVerification !== config.requireEmailVerification ||
    autoConfirmBookings !== config.autoConfirmBookings ||
    cancellationPolicyText !== (config.cancellationPolicyText ?? '') ||
    cancellationNoticeHours !== config.cancellationNoticeHours

  function handleSave() {
    setSaving(true)
    startTransition(async () => {
      const result = await updateConfirmationRules({
        requireEmailVerification,
        autoConfirmBookings,
        cancellationPolicyText: cancellationPolicyText.trim() || null,
        cancellationNoticeHours,
      })
      setSaving(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Confirmation rules saved.')
    })
  }

  function handleCancel() {
    setRequireEmailVerification(config.requireEmailVerification)
    setAutoConfirmBookings(config.autoConfirmBookings)
    setCancellationPolicyText(config.cancellationPolicyText ?? '')
    setCancellationNoticeHours(config.cancellationNoticeHours)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Confirmation rules</h2>
        <p className="text-sm text-muted-foreground">How bookings get confirmed and cancelled.</p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Require email verification</p>
              <p className="text-sm text-muted-foreground">
                Customer must confirm their email before the booking is finalized.
              </p>
            </div>
            <Switch checked={requireEmailVerification} onCheckedChange={setRequireEmailVerification} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Auto-confirm bookings</p>
              <p className="text-sm text-muted-foreground">
                Off requires a staff member to manually approve each booking.
              </p>
            </div>
            <Switch checked={autoConfirmBookings} onCheckedChange={setAutoConfirmBookings} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancellation-notice">Cancellation notice (hours)</Label>
            <Input
              id="cancellation-notice"
              type="number"
              min={0}
              max={720}
              value={cancellationNoticeHours}
              onChange={(e) => setCancellationNoticeHours(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancellation-policy">Cancellation policy text</Label>
            <Textarea
              id="cancellation-policy"
              value={cancellationPolicyText}
              onChange={(e) => setCancellationPolicyText(e.target.value)}
              rows={4}
              placeholder="Shown to customers when they try to cancel or reschedule."
            />
          </div>
        </CardContent>
      </Card>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </div>
  )
}
