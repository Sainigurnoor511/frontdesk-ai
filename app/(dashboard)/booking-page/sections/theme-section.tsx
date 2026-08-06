'use client'

import { useState, useTransition } from 'react'
import { Phone } from 'lucide-react'
import { toast } from 'sonner'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { BookingSection, SettingsCard } from '../section-layout'
import { cn } from '@/lib/utils'
import {
  BOOKING_ACCENT_PRESETS,
  BOOKING_THEME_OPTIONS,
  bookingAccentText,
} from '@/lib/booking-theme'
import type { OrganizationSettings } from '@/lib/data/settings'
import { updateBookingPageAppearance } from '../actions'
import { usePreviewDraft } from '../preview-draft-context'

export function ThemeSection({
  organizationName,
  settings,
}: {
  organizationName: string
  settings: OrganizationSettings
}) {
  const { reportDraft } = usePreviewDraft()
  const [, startTransition] = useTransition()
  const [theme, setTheme] = useState<'light' | 'dark'>(settings.bookingPageTheme)
  const [accent, setAccent] = useState(settings.bookingPageAccent)
  const [saving, setSaving] = useState(false)

  function selectTheme(value: 'light' | 'dark') {
    setTheme(value)
    reportDraft({ theme: value })
  }

  function selectAccent(value: string) {
    setAccent(value)
    reportDraft({ accent: value })
  }

  const dirty =
    theme !== settings.bookingPageTheme || accent.toLowerCase() !== settings.bookingPageAccent.toLowerCase()

  function handleSave() {
    setSaving(true)
    startTransition(async () => {
      const result = await updateBookingPageAppearance({
        bookingPageTheme: theme,
        bookingPageAccent: accent,
      })
      setSaving(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Theme saved.')
    })
  }

  function handleCancel() {
    setTheme(settings.bookingPageTheme)
    setAccent(settings.bookingPageAccent)
  }

  return (
    <BookingSection>
      <SettingsCard title="Theme" description="Light or dark mode, and your accent color." contentClassName="space-y-5 p-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">Theme</span>
            <div className="flex items-center gap-2">
              {BOOKING_THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectTheme(option.value)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                    theme === option.value
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Accent color</span>
            <div className="flex items-center gap-2">
              {BOOKING_ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Accent ${color}`}
                  onClick={() => selectAccent(color)}
                  className={cn(
                    'size-7 rounded-full border-2 transition-transform hover:scale-110',
                    accent.toLowerCase() === color.toLowerCase()
                      ? 'border-foreground'
                      : 'border-transparent'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              <label
                className="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-muted-foreground/50 text-[10px] font-medium text-muted-foreground hover:border-foreground"
                aria-label="Custom accent color"
              >
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => selectAccent(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                +
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Preview</span>
            <div
              className={cn(
                'flex flex-col items-center gap-3 rounded-xl border p-6',
                theme === 'dark' ? 'border-zinc-800 bg-zinc-950' : 'border-border bg-muted/30'
              )}
            >
              <p
                className={cn(
                  'text-sm font-semibold',
                  theme === 'dark' ? 'text-zinc-100' : 'text-foreground'
                )}
              >
                {organizationName}
              </p>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: accent, color: bookingAccentText(accent) }}
              >
                <Phone className="size-4" />
                Talk to your receptionist
              </button>
            </div>
          </div>
      </SettingsCard>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </BookingSection>
  )
}
