'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Service } from '@/lib/data/business'
import type { BookingPageStaff } from '@/lib/data/availability-engine'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { CallDialog } from '@/components/voice/call-dialog'
import { Turnstile } from '@/components/voice/turnstile'
import { bookingAccentText } from '@/lib/booking-theme'
import { BookingFlow } from './booking-flow'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

const HEADING_SIZE_CLASS: Record<BookingPageConfig['headingSize'], string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
}
const BODY_SIZE_CLASS: Record<BookingPageConfig['bodySize'], string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}
const FONT_WEIGHT_CLASS: Record<BookingPageConfig['fontWeight'], string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}
const LINE_HEIGHT_CLASS: Record<BookingPageConfig['lineHeight'], string> = {
  tight: 'leading-tight',
  normal: 'leading-normal',
  relaxed: 'leading-relaxed',
}
const LETTER_SPACING_CLASS: Record<BookingPageConfig['letterSpacing'], string> = {
  tight: 'tracking-tight',
  normal: 'tracking-normal',
  wide: 'tracking-wide',
}

/** Posted by the editor's preview pane (see PreviewFrame) to reflect unsaved
 * edits without a save round-trip. Only present when `previewMode` is true. */
export const BOOKING_PAGE_PREVIEW_MESSAGE_TYPE = 'booking-page-preview-update'
export type BookingPagePreviewMessage = {
  type: typeof BOOKING_PAGE_PREVIEW_MESSAGE_TYPE
  theme?: 'light' | 'dark'
  accent?: string
  config?: Partial<BookingPageConfig>
}

export function BookingPagePublicClient({
  organizationId,
  organizationName,
  services,
  staff,
  agentId,
  agentName,
  theme: initialTheme = 'light',
  accent: initialAccent = '#4F46E5',
  config: initialConfig,
  previewMode = false,
}: {
  organizationId: string
  organizationName: string
  services: Service[]
  staff: BookingPageStaff[]
  agentId: string | null
  agentName: string
  theme?: 'light' | 'dark'
  accent?: string
  config: BookingPageConfig
  previewMode?: boolean
}) {
  const [callOpen, setCallOpen] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [theme, setTheme] = useState(initialTheme)
  const [accent, setAccent] = useState(initialAccent)
  const [config, setConfig] = useState(initialConfig)

  useEffect(() => {
    if (!previewMode) return

    function handleMessage(event: MessageEvent) {
      const data = event.data as BookingPagePreviewMessage | undefined
      if (!data || data.type !== BOOKING_PAGE_PREVIEW_MESSAGE_TYPE) return

      if (data.theme) setTheme(data.theme)
      if (data.accent) setAccent(data.accent)
      if (data.config) setConfig((prev) => ({ ...prev, ...data.config }))
    }

    window.addEventListener('message', handleMessage)
    // Tell the parent we're ready to receive the first draft snapshot —
    // otherwise a message posted before this listener mounts is lost.
    window.parent.postMessage({ type: 'booking-page-preview-ready' }, '*')
    return () => window.removeEventListener('message', handleMessage)
  }, [previewMode])

  const isDark = theme === 'dark'
  const requireChallenge = Boolean(TURNSTILE_SITE_KEY)
  const showReceptionist = config.showReceptionistOnBookingPage && Boolean(agentId)
  const showBookingFlow = !config.receptionistOnly && services.length > 0

  const receptionistBlock = showReceptionist && (
    <div className="flex flex-col items-center gap-3">
      {TURNSTILE_SITE_KEY && (
        <Turnstile
          siteKey={TURNSTILE_SITE_KEY}
          theme={isDark ? 'dark' : 'light'}
          onToken={setTurnstileToken}
          onExpire={() => setTurnstileToken(null)}
        />
      )}
      <Button
        onClick={() => setCallOpen(true)}
        disabled={requireChallenge && !turnstileToken}
        className="gap-1.5"
        style={{ backgroundColor: accent, color: bookingAccentText(accent) }}
      >
        <Phone />
        Talk to {agentName}
      </Button>
      {config.showPhoneFallback && agentId && (
        <p className={cn(BODY_SIZE_CLASS[config.bodySize], isDark ? 'text-zinc-400' : 'text-muted-foreground')}>
          or call us directly
        </p>
      )}
    </div>
  )

  const bookingFlowBlock = showBookingFlow && (
    <BookingFlow
      organizationId={organizationId}
      organizationName={organizationName}
      services={services}
      staff={staff}
      theme={theme}
      accent={accent}
      showServiceDescriptions={config.showServiceDescriptions}
      showPrices={config.showPrices}
      customFields={config.customFields}
    />
  )

  return (
    <div
      className={cn(
        'min-h-svh bg-cover bg-center',
        isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-background text-foreground',
        FONT_WEIGHT_CLASS[config.fontWeight],
        LINE_HEIGHT_CLASS[config.lineHeight],
        LETTER_SPACING_CLASS[config.letterSpacing]
      )}
      style={{
        backgroundImage: config.backgroundImageUrl ? `url(${config.backgroundImageUrl})` : undefined,
        fontFamily: config.bodyFont,
      }}
    >
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        {config.showHeader && (
          <div className="space-y-1 text-center">
            {config.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt={organizationName} className="mx-auto h-12 w-auto object-contain" />
            )}
            <h1
              className={cn(HEADING_SIZE_CLASS[config.headingSize], 'font-semibold')}
              style={{ fontFamily: config.headingFont }}
            >
              {organizationName}
            </h1>
            <p className={cn(BODY_SIZE_CLASS[config.bodySize], isDark ? 'text-zinc-400' : 'text-muted-foreground')}>
              {config.tagline ?? 'Book an appointment or talk to our receptionist.'}
            </p>
            {config.businessDescription && (
              <p
                className={cn(
                  BODY_SIZE_CLASS[config.bodySize],
                  isDark ? 'text-zinc-400' : 'text-muted-foreground'
                )}
              >
                {config.businessDescription}
              </p>
            )}
          </div>
        )}

        {config.receptionistPosition === 'left' ? (
          <>
            {receptionistBlock}
            {bookingFlowBlock}
          </>
        ) : (
          <>
            {bookingFlowBlock}
            {receptionistBlock}
          </>
        )}

        {agentId && (
          <CallDialog
            open={callOpen}
            onOpenChange={setCallOpen}
            organizationId={organizationId}
            agentId={agentId}
            agentName={agentName}
            authenticated={false}
            turnstileToken={turnstileToken}
          />
        )}
      </div>
    </div>
  )
}
