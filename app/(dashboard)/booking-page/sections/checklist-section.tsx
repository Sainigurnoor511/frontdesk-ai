'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { BookingSection, SettingsCard } from '../section-layout'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { usePreviewDraft } from '../preview-draft-context'
import { updateConfirmationRules } from '../actions'

export function ChecklistSection({ config }: { config: BookingPageConfig }) {
  const { reportDraft } = usePreviewDraft()
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
    <BookingSection>
      <SettingsCard
        title="Confirmation rules"
        description="How bookings get confirmed and cancelled."
        contentClassName="space-y-5 p-4"
      >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Require email verification</p>
              <p className="text-sm text-muted-foreground">
                Customer must confirm their email before the booking is finalized.
              </p>
            </div>
            <Switch
              checked={requireEmailVerification}
              onCheckedChange={(value) => {
                setRequireEmailVerification(value)
                reportDraft({ config: { requireEmailVerification: value } })
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Auto-confirm bookings</p>
              <p className="text-sm text-muted-foreground">
                Off requires a staff member to manually approve each booking.
              </p>
            </div>
            <Switch
              checked={autoConfirmBookings}
              onCheckedChange={(value) => {
                setAutoConfirmBookings(value)
                reportDraft({ config: { autoConfirmBookings: value } })
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancellation-notice">Cancellation notice (hours)</Label>
            <Input
              id="cancellation-notice"
              type="number"
              min={0}
              max={720}
              value={cancellationNoticeHours}
              onChange={(e) => {
                const value = Number(e.target.value)
                setCancellationNoticeHours(value)
                reportDraft({ config: { cancellationNoticeHours: value } })
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancellation-policy">Cancellation policy text</Label>
            <Textarea
              id="cancellation-policy"
              value={cancellationPolicyText}
              onChange={(e) => {
                const value = e.target.value
                setCancellationPolicyText(value)
                reportDraft({ config: { cancellationPolicyText: value.trim() || null } })
              }}
              rows={4}
              placeholder="Shown to customers when they try to cancel or reschedule."
            />
          </div>
      </SettingsCard>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </BookingSection>
  )
}
