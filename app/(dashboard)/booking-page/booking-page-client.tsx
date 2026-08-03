'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Copy, ChevronDown, Code, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { cn } from '@/lib/utils'
import {
  BOOKING_ACCENT_PRESETS,
  BOOKING_THEME_OPTIONS,
  bookingAccentText,
} from '@/lib/booking-theme'
import type { OrganizationSettings } from '@/lib/data/settings'
import type { Service } from '@/lib/data/business'
import {
  updateBookingPageEnabled,
  updateBookingPageAppearance,
  toggleServiceOnBookingPage,
} from './actions'

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function formatPrice(price: number) {
  return `$${price.toFixed(2)}`
}

export function BookingPageClient({
  organizationId,
  organizationName,
  settings,
  services,
}: {
  organizationId: string
  organizationName: string
  settings: OrganizationSettings
  services: Service[]
}) {
  const [enabled, setEnabled] = useState(settings.bookingPageEnabled)
  const [, startTransition] = useTransition()
  const [theme, setTheme] = useState<'light' | 'dark'>(settings.bookingPageTheme)
  const [accent, setAccent] = useState(settings.bookingPageAccent)
  const [savingAppearance, setSavingAppearance] = useState(false)

  const appearanceDirty =
    theme !== settings.bookingPageTheme ||
    accent.toLowerCase() !== settings.bookingPageAccent.toLowerCase()

  function handleSaveAppearance() {
    setSavingAppearance(true)
    startTransition(async () => {
      const result = await updateBookingPageAppearance({
        bookingPageTheme: theme,
        bookingPageAccent: accent,
      })
      setSavingAppearance(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Appearance saved.')
    })
  }

  function handleCancelAppearance() {
    setTheme(settings.bookingPageTheme)
    setAccent(settings.bookingPageAccent)
  }

  // TODO: organizations table has no `slug` column yet. Using a lowercase-dashed
  // display slug derived from the org name (falling back to the org id) as a
  // stand-in. A real public `/book/[slug]` route with a persisted, unique slug
  // is a follow-up feature.
  const slug = slugify(organizationName) || organizationId
  const bookingUrl = `yourapp.com/book/${slug}`
  const embedSnippet = `<iframe src="https://${bookingUrl}" width="100%" height="800" frameborder="0"></iframe>`

  function handleToggleEnabled(checked: boolean) {
    setEnabled(checked)
    startTransition(async () => {
      const result = await updateBookingPageEnabled({ bookingPageEnabled: checked })
      if ('error' in result) {
        toast.error(result.error)
        setEnabled(!checked)
      }
    })
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Bookings page</h1>
          <p className="mt-1 text-sm font-normal text-[#96989d]">
            Your public booking link, where clients can book appointments themselves.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Enable online booking</span>
          <Switch checked={enabled} onCheckedChange={handleToggleEnabled} />
        </div>
      </div>

      {!enabled && (
        <div className="rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Your booking page is currently disabled. Clients won&apos;t be able to book online.
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="text-sm font-semibold">Booking page URL</h3>
            <p className="text-sm text-muted-foreground">
              Share this link with clients so they can book appointments online.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input value={bookingUrl} readOnly className="font-mono text-sm" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(`https://${bookingUrl}`, 'Link')}
            >
              <Copy className="size-4" />
            </Button>
          </div>

          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium">
              <span className="flex items-center gap-2">
                <Code className="size-4" />
                Embed on your website
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-3">
              <p className="text-sm text-muted-foreground">
                Paste this snippet into your website&apos;s HTML to embed the booking page.
              </p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  <code>{embedSnippet}</code>
                </pre>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(embedSnippet, 'Snippet')}
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Appearance</h3>
          <p className="text-sm text-muted-foreground">
            Customize how your public booking page looks to clients.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-5 p-4">
            <div className="space-y-2">
              <span className="text-sm font-medium">Theme</span>
              <div className="flex items-center gap-2">
                {BOOKING_THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
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
                    onClick={() => setAccent(color)}
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
                    onChange={(e) => setAccent(e.target.value)}
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
          </CardContent>
        </Card>

        <UnsavedChangesBar
          show={appearanceDirty}
          saving={savingAppearance}
          onSave={handleSaveAppearance}
          onCancel={handleCancelAppearance}
        />
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Services shown on this page</h3>
          <p className="text-sm text-muted-foreground">
            Choose which services clients can book from your public booking page.
          </p>
        </div>

        {services.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No services yet.{' '}
              <Link href="/business?tab=services" className="text-foreground underline">
                Add services in Business
              </Link>{' '}
              to make them bookable online.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {services.map((service) => (
                  <ServiceRow key={service.id} service={service} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function ServiceRow({ service }: { service: Service }) {
  const [showOnBookingPage, setShowOnBookingPage] = useState(service.showOnBookingPage)
  const [, startTransition] = useTransition()

  function handleToggle(checked: boolean) {
    setShowOnBookingPage(checked)
    startTransition(async () => {
      const result = await toggleServiceOnBookingPage(service.id, checked)
      if ('error' in result) {
        toast.error(result.error)
        setShowOnBookingPage(!checked)
      }
    })
  }

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{service.name}</p>
        <p className="text-sm text-muted-foreground">
          {service.durationMinutes} min · {formatPrice(service.price)}
        </p>
      </div>
      <Switch checked={showOnBookingPage} onCheckedChange={handleToggle} />
    </li>
  )
}
