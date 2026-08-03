'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import type { Service } from '@/lib/data/business'
import type { BookingPageStaff } from '@/lib/data/availability-engine'
import type { CustomField } from '@/lib/data/booking-page-config'
import { getPublicAvailableSlots, createPublicAppointment } from '@/app/book/actions'
import { bookingAccentText } from '@/lib/booking-theme'

type Step = 'service' | 'staff' | 'datetime' | 'contact' | 'confirm' | 'success'

function formatSlotLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(
    new Date(iso)
  )
}

export function BookingFlow({
  organizationId,
  organizationName,
  services,
  staff,
  theme = 'light',
  accent = '#4F46E5',
  showServiceDescriptions = true,
  showPrices = true,
  customFields = [],
}: {
  organizationId: string
  organizationName: string
  services: Service[]
  staff: BookingPageStaff[]
  theme?: 'light' | 'dark'
  accent?: string
  showServiceDescriptions?: boolean
  showPrices?: boolean
  customFields?: CustomField[]
}) {
  const isDark = theme === 'dark'
  const [step, setStep] = useState<Step>('service')
  const [service, setService] = useState<Service | null>(null)
  const [staffId, setStaffId] = useState<string | undefined>(undefined)
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [slots, setSlots] = useState<{ startsAt: string; endsAt: string }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ startsAt: string; endsAt: string } | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [customAnswers, setCustomAnswers] = useState<Record<string, string | boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function loadSlots(forDate: Date, chosenStaffId: string | undefined, forService: Service) {
    setSlotsLoading(true)
    const dateStr = forDate.toISOString().slice(0, 10)
    const result = await getPublicAvailableSlots({
      organizationId,
      serviceId: forService.id,
      staffId: chosenStaffId,
      date: dateStr,
    })
    setSlotsLoading(false)
    if ('error' in result) {
      setSlots([])
      return
    }
    setSlots(result.slots)
  }

  function handleSelectService(selected: Service) {
    setService(selected)
    setStep(staff.length > 0 ? 'staff' : 'datetime')
  }

  function handleSelectStaff(id: string | undefined) {
    setStaffId(id)
    setStep('datetime')
  }

  async function handleSelectDate(selected: Date | undefined) {
    setDate(selected)
    setSelectedSlot(null)
    setErrorMessage(null)
    if (selected && service) await loadSlots(selected, staffId, service)
  }

  function handleSelectSlot(slot: { startsAt: string; endsAt: string }) {
    setSelectedSlot(slot)
    setErrorMessage(null)
    setStep('contact')
  }

  function handleContactSubmit() {
    setStep('confirm')
  }

  async function handleConfirm() {
    if (!service || !selectedSlot) return
    setSubmitting(true)
    setErrorMessage(null)

    const customAnswersNotes =
      customFields.length > 0
        ? customFields
            .map((field) => `${field.label}: ${customAnswers[field.id] ?? ''}`)
            .join('\n')
        : undefined

    const result = await createPublicAppointment({
      organizationId,
      serviceId: service.id,
      staffId,
      startsAt: selectedSlot.startsAt,
      endsAt: selectedSlot.endsAt,
      clientName,
      clientEmail,
      clientPhone: clientPhone || undefined,
      businessName: organizationName,
      notes: customAnswersNotes,
    })

    setSubmitting(false)

    if ('error' in result) {
      if (result.error === 'slot_taken') {
        setErrorMessage('That time is no longer available. Please pick another.')
        setSelectedSlot(null)
        setStep('datetime')
        if (date && service) await loadSlots(date, staffId, service)
        return
      }
      setErrorMessage(result.error)
      return
    }

    setStep('success')
  }

  const cardClass = cn(isDark && 'border-zinc-800 bg-zinc-900')

  if (step === 'service') {
    return (
      <Card className={cardClass}>
        <CardContent className="divide-y p-0">
          {services.map((svc) => (
            <button
              key={svc.id}
              type="button"
              onClick={() => handleSelectService(svc)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50"
            >
              <div>
                <p className="text-sm font-medium">{svc.name}</p>
                <p className={cn('text-xs', isDark ? 'text-zinc-400' : 'text-muted-foreground')}>
                  {svc.durationMinutes} min
                </p>
                {showServiceDescriptions && svc.description && (
                  <p className={cn('text-xs', isDark ? 'text-zinc-400' : 'text-muted-foreground')}>
                    {svc.description}
                  </p>
                )}
              </div>
              {showPrices && <p className="text-sm font-medium">${svc.price.toFixed(2)}</p>}
            </button>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (step === 'staff') {
    return (
      <Card className={cardClass}>
        <CardContent className="divide-y p-0">
          <button
            type="button"
            onClick={() => handleSelectStaff(undefined)}
            className="flex w-full px-4 py-3 text-left hover:bg-muted/50"
          >
            Any staff member
          </button>
          {staff.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => handleSelectStaff(member.id)}
              className="flex w-full px-4 py-3 text-left hover:bg-muted/50"
            >
              {member.name}
            </button>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (step === 'datetime') {
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
              <Button key={slot.startsAt} type="button" variant="outline" onClick={() => handleSelectSlot(slot)}>
                {formatSlotLabel(slot.startsAt)}
              </Button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (step === 'contact') {
    return (
      <Card className={cardClass}>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="booking-name">Name</Label>
            <Input id="booking-name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="booking-email">Email</Label>
            <Input
              id="booking-email"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="booking-phone">Phone (optional)</Label>
            <Input id="booking-phone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
          </div>

          {customFields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={`custom-${field.id}`}>
                {field.label}
                {field.required && ' *'}
              </Label>
              {field.type === 'text' && (
                <Input
                  id={`custom-${field.id}`}
                  value={(customAnswers[field.id] as string) ?? ''}
                  onChange={(e) =>
                    setCustomAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                />
              )}
              {field.type === 'checkbox' && (
                <input
                  id={`custom-${field.id}`}
                  type="checkbox"
                  checked={Boolean(customAnswers[field.id])}
                  onChange={(e) =>
                    setCustomAnswers((prev) => ({ ...prev, [field.id]: e.target.checked }))
                  }
                />
              )}
              {field.type === 'dropdown' && (
                <select
                  id={`custom-${field.id}`}
                  value={(customAnswers[field.id] as string) ?? ''}
                  onChange={(e) =>
                    setCustomAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}

          <Button
            type="button"
            disabled={!clientName.trim() || !clientEmail.trim()}
            onClick={handleContactSubmit}
            style={{ backgroundColor: accent, color: bookingAccentText(accent) }}
          >
            Continue
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === 'confirm') {
    return (
      <Card className={cardClass}>
        <CardContent className="space-y-4 p-4">
          <p className="text-sm">
            <strong>{service?.name}</strong>
            {selectedSlot && ` — ${formatSlotLabel(selectedSlot.startsAt)}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {clientName} · {clientEmail}
          </p>
          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          <Button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            style={{ backgroundColor: accent, color: bookingAccentText(accent) }}
          >
            Confirm booking
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cardClass}>
      <CardContent className="p-4 text-sm">
        Your appointment is booked. A confirmation email is on its way to {clientEmail}.
      </CardContent>
    </Card>
  )
}
