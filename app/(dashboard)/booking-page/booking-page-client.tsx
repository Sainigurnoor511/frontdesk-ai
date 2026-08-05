'use client'

import { useState, useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { LayoutGrid, ExternalLink } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { OrganizationSettings } from '@/lib/data/settings'
import type { Service } from '@/lib/data/business'
import type { BusinessProfile } from '@/lib/data/business'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { EditorSidebar, type EditorSection } from './editor-sidebar'
import { GlobalSection } from './sections/global-section'
import { ThemeSection } from './sections/theme-section'
import { TypographySection } from './sections/typography-section'
import { BrandingSection } from './sections/branding-section'
import { CalendarSection } from './sections/calendar-section'
import { LayoutSection } from './sections/layout-section'
import { MediaSection } from './sections/media-section'
import { FormsSection } from './sections/forms-section'
import { ChecklistSection } from './sections/checklist-section'
import { SchedulingSection } from './sections/scheduling-section'
import { HistorySection } from './sections/history-section'
import { PreviewDraftProvider } from './preview-draft-context'
import { PreviewPane } from './preview-pane'
import { TemplatesDialog } from './templates-dialog'
import { updateBookingPageEnabled, toggleServiceOnBookingPage } from './actions'
import { getPublicBookingPath } from '@/lib/public-booking-url'

function formatPrice(price: number) {
  return `$${price.toFixed(2)}`
}

export function BookingPageClient({
  organizationId,
  organizationName,
  organizationSlug,
  settings,
  services,
  businessProfile,
  config,
}: {
  organizationId: string
  organizationName: string
  organizationSlug: string
  settings: OrganizationSettings
  services: Service[]
  businessProfile: BusinessProfile
  config: BookingPageConfig
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [enabled, setEnabled] = useState(settings.bookingPageEnabled)
  const [slug, setSlug] = useState(organizationSlug)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [, startTransition] = useTransition()

  const section = (searchParams.get('section') as EditorSection | null) ?? 'global'

  function setSection(next: EditorSection) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('section', next)
    router.push(`${pathname}?${params.toString()}`)
  }

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b-1 pb-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Bookings page</h1>
          <p className="mt-1 text-sm font-normal text-[#96989d]">
            Your public booking link, where clients can book appointments themselves.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" className="gap-1.5" onClick={() => setTemplatesOpen(true)}>
            <LayoutGrid className="size-4" />
            Templates
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            nativeButton={false}
            render={<a href={getPublicBookingPath(slug)} target="_blank" rel="noreferrer" />}
          >
            Open public page
            <ExternalLink className="size-4" />
          </Button>
          <span className="ml-2 text-sm font-medium">Enable online booking</span>
          <Switch checked={enabled} onCheckedChange={handleToggleEnabled} />
        </div>
      </div>

      <TemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onApplied={() => router.refresh()}
      />

      {!enabled && (
        <div className="shrink-0 rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Your booking page is currently disabled. Clients won&apos;t be able to book online.
        </div>
      )}

      <PreviewDraftProvider>
        <div className="flex min-h-0 flex-1 gap-4">
          <EditorSidebar active={section} onSelect={setSection} />

          <div className="scrollbar-thin min-h-0 min-w-0 flex-1 basis-1/2 overflow-y-auto">
            {section === 'global' && (
              <div className="space-y-6 p-4">
                <GlobalSection
                  organizationSlug={slug}
                  organizationName={organizationName}
                  onSlugSaved={setSlug}
                  config={config}
                />

                <Card>
                  <CardContent className="p-0">
                    <div className="space-y-1 border-b p-4">
                      <h3 className="text-sm font-semibold">Services shown on this page</h3>
                      <p className="text-sm text-muted-foreground">
                        Choose which services clients can book from your public booking page.
                      </p>
                    </div>

                    {services.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">
                        No services yet.{' '}
                        <Link href="/business?tab=services" className="text-foreground underline">
                          Add services in Business
                        </Link>{' '}
                        to make them bookable online.
                      </p>
                    ) : (
                      <ul className="divide-y">
                        {services.map((service) => (
                          <ServiceRow key={service.id} service={service} />
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {section === 'theme' && (
              <ThemeSection organizationName={organizationName} settings={settings} />
            )}
            {section === 'typography' && <TypographySection config={config} />}
            {section === 'branding' && (
              <BrandingSection organizationId={organizationId} config={config} />
            )}
            {section === 'calendar' && <CalendarSection businessProfile={businessProfile} />}
            {section === 'layout' && <LayoutSection config={config} />}
            {section === 'media' && <MediaSection organizationId={organizationId} config={config} />}
            {section === 'forms' && <FormsSection config={config} />}
            {section === 'checklist' && <ChecklistSection config={config} />}
            {section === 'scheduling' && <SchedulingSection />}
            {section === 'history' && <HistorySection />}
          </div>

          <div className="min-h-0 min-w-0 flex-1 basis-1/2">
            <PreviewPane
              slug={slug}
              initialDraft={{
                theme: settings.bookingPageTheme,
                accent: settings.bookingPageAccent,
                config,
              }}
            />
          </div>
        </div>
      </PreviewDraftProvider>
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
