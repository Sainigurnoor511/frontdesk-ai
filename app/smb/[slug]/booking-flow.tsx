'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { ChevronLeft, ChevronRight, Clock, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Service } from '@/lib/data/business'
import type { BookingPageStaff } from '@/lib/data/availability-engine'
import type { CustomField } from '@/lib/data/booking-page-config'
import { getPublicAvailableSlots, createPublicAppointment } from '@/app/smb/actions'
import { bookingAccentText } from '@/lib/booking-theme'

const ANY_STAFF_VALUE = '__any__'

type Step = 'service' | 'datetime' | 'contact' | 'confirm' | 'success'

const STEP_LABELS: Record<Exclude<Step, 'success'>, string> = {
  service: 'Service',
  datetime: 'Date & time',
  contact: 'Your details',
  confirm: 'Confirm',
}

function formatSlotLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(
    new Date(iso)
  )
}

function formatDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(iso)
  )
}

function formatDateFromLocal(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function StepHeader({
  step,
  onBack,
  accent,
}: {
  step: Exclude<Step, 'success'>
  onBack?: () => void
  accent: string
}) {
  const steps: Exclude<Step, 'success'>[] = ['service', 'datetime', 'contact', 'confirm']
  const currentIndex = steps.indexOf(step)

  return (
    <div className="space-y-3">
      {onBack && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1" onClick={onBack}>
          <ChevronLeft className="size-4" />
          Back
        </Button>
      )}
      <div className="flex items-center gap-2">
        {steps.map((s, index) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                index <= currentIndex ? 'text-white' : 'bg-muted text-muted-foreground'
              )}
              style={index <= currentIndex ? { backgroundColor: accent } : undefined}
            >
              {index + 1}
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn('h-0.5 flex-1 rounded', index < currentIndex ? '' : 'bg-muted')}
                style={index < currentIndex ? { backgroundColor: accent } : undefined}
              />
            )}
          </div>
        ))}
      </div>
      <p className="text-sm font-medium">{STEP_LABELS[step]}</p>
    </div>
  )
}

function isCustomFieldValid(
  field: CustomField,
  answers: Record<string, string | boolean>
): boolean {
  if (!field.required) return true
  const value = answers[field.id]
  if (field.type === 'checkbox') return value === true
  return typeof value === 'string' && value.trim().length > 0
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
  const [datetimeSubstep, setDatetimeSubstep] = useState<'date' | 'time'>('date')
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
    const dateStr = toLocalDateString(forDate)
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
    setDatetimeSubstep('date')
    setDate(undefined)
    setSlots([])
    setSelectedSlot(null)
    setStep('datetime')
  }

  async function handleSelectStaffFilter(value: string) {
    const id = value === ANY_STAFF_VALUE ? undefined : value
    setStaffId(id)
    setSelectedSlot(null)
    if (date && service) await loadSlots(date, id, service)
  }

  async function handleSelectDate(selected: Date | undefined) {
    setDate(selected)
    setSelectedSlot(null)
    setErrorMessage(null)
    if (!selected || !service) return
    await loadSlots(selected, staffId, service)
    setDatetimeSubstep('time')
  }

  function handleSelectSlot(slot: { startsAt: string; endsAt: string }) {
    setSelectedSlot(slot)
    setErrorMessage(null)
    setStep('contact')
  }

  function handleContactSubmit() {
    const missingRequired = customFields.some(
      (field) => !isCustomFieldValid(field, customAnswers)
    )
    if (missingRequired) {
      setErrorMessage('Please complete all required fields.')
      return
    }
    setErrorMessage(null)
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
        setDatetimeSubstep('time')
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {services.map((svc) => (
          <button
            key={svc.id}
            type="button"
            onClick={() => handleSelectService(svc)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50',
              isDark ? 'border-zinc-800 bg-zinc-900' : 'border-border bg-white'
            )}
          >
            <div className="flex w-full items-start justify-between gap-2">
              <p className="truncate text-sm font-semibold" title={svc.name}>
                {svc.name}
              </p>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </div>
            {showServiceDescriptions && svc.description && (
              <p
                className={cn(
                  'line-clamp-2 text-xs',
                  isDark ? 'text-zinc-400' : 'text-muted-foreground'
                )}
                title={svc.description}
              >
                {svc.description}
              </p>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{showPrices ? (svc.price > 0 ? `$${svc.price.toFixed(2)}` : 'Free') : 'Price on request'}</span>
              <span aria-hidden="true">·</span>
              <Clock className="size-3.5" />
              <span>{svc.durationMinutes} min</span>
            </div>
          </button>
        ))}
      </div>
    )
  }

  if (step === 'datetime') {
    const datetimeBack =
      datetimeSubstep === 'time'
        ? () => setDatetimeSubstep('date')
        : () => setStep('service')

    return (
      <div className="space-y-4">
        <StepHeader step="datetime" accent={accent} onBack={datetimeBack} />
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

        {datetimeSubstep === 'date' && (
          <>
            {staff.length > 0 && (
              <div className="space-y-2">
                <Label>Staff member</Label>
                <select
                  value={staffId ?? ANY_STAFF_VALUE}
                  onChange={(e) => void handleSelectStaffFilter(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm sm:w-64"
                >
                  <option value={ANY_STAFF_VALUE}>Any staff member</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Select a date</Label>
              <Calendar mode="single" selected={date} onSelect={(value) => void handleSelectDate(value)} />
            </div>
          </>
        )}

        {datetimeSubstep === 'time' && date && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div>
                <p className="text-xs text-muted-foreground">Selected date</p>
                <p className="text-sm font-medium">{formatDateFromLocal(date)}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDatetimeSubstep('date')}>
                Change
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Select a time</Label>
              {slotsLoading && <p className="text-sm text-muted-foreground">Loading times…</p>}
              {!slotsLoading && slots.length === 0 && (
                <p className="text-sm text-muted-foreground">No times available this day.</p>
              )}
              {!slotsLoading && slots.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <Button
                      key={slot.startsAt}
                      type="button"
                      variant={selectedSlot?.startsAt === slot.startsAt ? 'default' : 'outline'}
                      onClick={() => handleSelectSlot(slot)}
                      style={
                        selectedSlot?.startsAt === slot.startsAt
                          ? { backgroundColor: accent, color: bookingAccentText(accent) }
                          : undefined
                      }
                    >
                      {formatSlotLabel(slot.startsAt)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (step === 'contact') {
    return (
      <Card className={cardClass}>
        <CardContent className="space-y-4 p-4">
          <StepHeader
            step="contact"
            accent={accent}
            onBack={() => {
              setDatetimeSubstep('time')
              setStep('datetime')
            }}
          />
          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
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
    const staffMember = staff.find((member) => member.id === staffId)
    return (
      <Card className={cardClass}>
        <CardContent className="space-y-4 p-4">
          <StepHeader step="confirm" accent={accent} onBack={() => setStep('contact')} />
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="text-xs text-muted-foreground">Service</p>
              <p className="font-medium">{service?.name}</p>
            </div>
            {selectedSlot && (
              <div>
                <p className="text-xs text-muted-foreground">When</p>
                <p className="font-medium">
                  {formatDateLabel(selectedSlot.startsAt)} at {formatSlotLabel(selectedSlot.startsAt)}
                </p>
              </div>
            )}
            {staffMember && (
              <div>
                <p className="text-xs text-muted-foreground">Staff</p>
                <p className="font-medium">{staffMember.name}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Contact</p>
              <p className="font-medium">{clientName}</p>
              <p className="text-sm text-muted-foreground">{clientEmail}</p>
              {clientPhone && <p className="text-sm text-muted-foreground">{clientPhone}</p>}
            </div>
          </div>
          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          <Button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            style={{ backgroundColor: accent, color: bookingAccentText(accent) }}
          >
            {submitting ? 'Booking…' : 'Confirm booking'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cardClass}>
      <CardContent className="space-y-4 p-6 text-center">
        <CheckCircle2 className="mx-auto size-10" style={{ color: accent }} />
        <div className="space-y-1">
          <p className="text-lg font-semibold">You&apos;re booked!</p>
          <p className="text-sm text-muted-foreground">
            A confirmation email is on its way to {clientEmail}.
          </p>
        </div>
        {service && selectedSlot && (
          <div className="rounded-lg border p-4 text-left text-sm">
            <p className="font-medium">{service.name}</p>
            <p className="text-muted-foreground">
              {formatDateLabel(selectedSlot.startsAt)} at {formatSlotLabel(selectedSlot.startsAt)}
            </p>
            <p className="text-muted-foreground">{organizationName}</p>
          </div>
        )}
        <Button type="button" variant="outline" onClick={() => setStep('service')}>
          Book another appointment
        </Button>
      </CardContent>
    </Card>
  )
}
