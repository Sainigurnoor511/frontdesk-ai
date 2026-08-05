'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import {
  lookupPublicAppointments,
  reschedulePublicAppointment,
  cancelPublicAppointment,
  getPublicAvailableSlots,
  type PublicAppointmentSummary,
} from '@/app/book/actions'

type Step = 'lookup' | 'list' | 'reschedule' | 'done'

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function formatSlotLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(
    new Date(iso)
  )
}

export function ManageBookingFlow({
  organizationId,
  theme = 'light',
  accent = '#4F46E5',
}: {
  organizationId: string
  theme?: 'light' | 'dark'
  accent?: string
}) {
  const isDark = theme === 'dark'
  const [step, setStep] = useState<Step>('lookup')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [appointments, setAppointments] = useState<PublicAppointmentSummary[]>([])
  const [selected, setSelected] = useState<PublicAppointmentSummary | null>(null)
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [slots, setSlots] = useState<{ startsAt: string; endsAt: string }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  const cardClass = cn(isDark && 'border-zinc-800 bg-zinc-900')

  async function handleLookup() {
    setLoading(true)
    setErrorMessage(null)
    const result = await lookupPublicAppointments({ organizationId, email })
    setLoading(false)

    if ('error' in result) {
      setErrorMessage(result.error)
      return
    }
    if (result.appointments.length === 0) {
      setErrorMessage('No upcoming appointments found for that email.')
      return
    }
    setAppointments(result.appointments)
    setStep('list')
  }

  async function handleCancel(appointment: PublicAppointmentSummary) {
    setLoading(true)
    const result = await cancelPublicAppointment({
      organizationId,
      appointmentId: appointment.id,
      email,
    })
    setLoading(false)

    if ('error' in result) {
      setErrorMessage(result.error)
      return
    }
    setAppointments((prev) => prev.filter((a) => a.id !== appointment.id))
    setStep('done')
  }

  function startReschedule(appointment: PublicAppointmentSummary) {
    setSelected(appointment)
    setDate(undefined)
    setSlots([])
    setStep('reschedule')
  }

  async function handleSelectDate(selectedDate: Date | undefined) {
    setDate(selectedDate)
    if (!selectedDate || !selected) return
    setSlotsLoading(true)
    const dateStr = selectedDate.toISOString().slice(0, 10)
    const result = await getPublicAvailableSlots({
      organizationId,
      serviceId: selected.serviceId ?? undefined,
      date: dateStr,
    })
    setSlotsLoading(false)
    if ('error' in result) {
      setSlots([])
      return
    }
    setSlots(result.slots)
  }

  async function handleConfirmReschedule(slot: { startsAt: string; endsAt: string }) {
    if (!selected) return
    setLoading(true)
    setErrorMessage(null)
    const result = await reschedulePublicAppointment({
      organizationId,
      appointmentId: selected.id,
      email,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    })
    setLoading(false)

    if ('error' in result) {
      setErrorMessage(
        result.error === 'slot_taken' ? 'That time is no longer available. Please pick another.' : result.error
      )
      return
    }
    setStep('done')
  }

  if (step === 'lookup') {
    return (
      <Card className={cardClass}>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="manage-email">Email</Label>
            <Input
              id="manage-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          <Button
            type="button"
            disabled={loading || !email.trim()}
            onClick={handleLookup}
            style={{ backgroundColor: accent, color: 'white' }}
          >
            {loading ? 'Looking up…' : 'Find my appointments'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === 'list') {
    return (
      <Card className={cardClass}>
        <CardContent className="divide-y p-0">
          {appointments.map((appointment) => (
            <div key={appointment.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{appointment.title}</p>
                <p className={cn('text-xs', isDark ? 'text-zinc-400' : 'text-muted-foreground')}>
                  {formatDateTime(appointment.startsAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => startReschedule(appointment)}>
                  Reschedule
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => handleCancel(appointment)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (step === 'reschedule') {
    return (
      <div className="space-y-4">
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <Calendar mode="single" selected={date} onSelect={handleSelectDate} />
        {slotsLoading && <p className="text-sm text-muted-foreground">Loading times…</p>}
        {!slotsLoading && date && slots.length === 0 && (
          <p className="text-sm text-muted-foreground">No times available this day.</p>
        )}
        {!slotsLoading && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => (
              <Button
                key={slot.startsAt}
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => handleConfirmReschedule(slot)}
              >
                {formatSlotLabel(slot.startsAt)}
              </Button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card className={cardClass}>
      <CardContent className="p-4 text-sm">Done. Check your email for the updated details.</CardContent>
    </Card>
  )
}
