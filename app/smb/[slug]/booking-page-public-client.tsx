'use client'

import { useEffect, useState } from 'react'
import { Phone, PhoneOff, ArrowUp, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Service } from '@/lib/data/business'
import type { BookingPageStaff } from '@/lib/data/availability-engine'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { Orb } from '@/components/ui/orb'
import { useVoiceCall } from '@/components/voice/use-voice-call'
import { startPublicCall } from '@/app/smb/actions'
import { BookingFlow } from './booking-flow'
import { ManageBookingFlow } from './manage-booking-flow'

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

function formatTimezoneOffset(timezone: string): string {
  try {
    const offsetPart = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value

    if (!offsetPart) return 'GMT+0:00'

    // Intl returns e.g. "GMT+5:30" or, for zero-offset zones, the bare
    // "GMT+0"/"GMT" (with no minutes component) — normalize both to the
    // "GMT+H:MM" shape the spec's screenshot uses ("GMT+5:30").
    const match = offsetPart.match(/^GMT([+-]\d+)(?::(\d{2}))?$/)
    if (!match) return offsetPart === 'GMT' ? 'GMT+0:00' : offsetPart
    const [, hours, minutes = '00'] = match
    return `GMT${hours}:${minutes}`
  } catch {
    return 'GMT+0:00'
  }
}

/**
 * The receptionist panel: full-bleed hero photo, orb avatar with an
 * overlapping call button, "Or call" + phone-number pill, and a chat input
 * pinned to the bottom. Voice/chat happen inline here (LiveKit room join via
 * useVoiceCall) — there is deliberately no modal/dialog, matching the public
 * page mock exactly.
 */
function ReceptionistPanel({
  organizationId,
  agentId,
  agentName,
  backgroundImageUrl,
  showPhoneFallback,
  fullBleed = false,
}: {
  organizationId: string
  agentId: string
  agentName: string
  backgroundImageUrl: string | null
  showPhoneFallback: boolean
  fullBleed?: boolean
}) {
  const [chatMessage, setChatMessage] = useState('')
  const { status, connect, disconnect } = useVoiceCall(() =>
    startPublicCall({ organizationId, agentId })
  )
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  function handleCallClick() {
    if (isConnected) {
      disconnect()
      return
    }
    void connect()
  }

  function handleChatSubmit() {
    if (!chatMessage.trim()) return
    setChatMessage('')
    void connect()
  }

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-between overflow-hidden bg-cover bg-center px-4 py-10',
        fullBleed ? 'min-h-svh' : 'h-full min-h-[600px]'
      )}
      style={{ backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined }}
    >
      {backgroundImageUrl && <div className="absolute inset-0 bg-black/10" aria-hidden="true" />}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-2">
        <div className="relative">
          <div className="flex size-44 items-center justify-center overflow-hidden rounded-full shadow-xl">
            <Orb agentState={isConnected ? 'listening' : null} seed={1} />
          </div>
          <button
            type="button"
            onClick={handleCallClick}
            disabled={isConnecting}
            aria-label={isConnected ? `End call with ${agentName}` : `Call ${agentName}`}
            className="absolute -bottom-2 left-1/2 flex size-11 -translate-x-1/2 items-center justify-center rounded-full border-4 bg-black text-white shadow-md disabled:opacity-60"
            style={{ borderColor: backgroundImageUrl ? 'rgba(255,255,255,0.9)' : 'white' }}
          >
            {isConnected ? <PhoneOff className="size-4" fill="currentColor" /> : <Phone className="size-4" />}
          </button>
        </div>

        {showPhoneFallback && (
          <p className={cn('mt-6 text-sm', backgroundImageUrl ? 'text-white/90' : 'text-muted-foreground')}>
            Or call
          </p>
        )}
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-4 shadow-lg">
          <input
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleChatSubmit()
            }}
            placeholder="Send a message..."
            className="flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
          />
          <button
            type="button"
            onClick={handleChatSubmit}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-black text-white"
            aria-label="Send message"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
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
  timezone = 'UTC',
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
  timezone?: string
}) {
  const [theme, setTheme] = useState(initialTheme)
  const [config, setConfig] = useState(initialConfig)
  const [tab, setTab] = useState<'book' | 'manage'>('book')
  const [mobilePanel, setMobilePanel] = useState<'steps' | 'assistant'>('steps')

  useEffect(() => {
    if (!previewMode) return

    function handleMessage(event: MessageEvent) {
      const data = event.data as BookingPagePreviewMessage | undefined
      if (!data || data.type !== BOOKING_PAGE_PREVIEW_MESSAGE_TYPE) return

      if (data.theme) setTheme(data.theme)
      if (data.config) setConfig((prev) => ({ ...prev, ...data.config }))
    }

    window.addEventListener('message', handleMessage)
    // Tell the parent we're ready to receive the first draft snapshot —
    // otherwise a message posted before this listener mounts is lost.
    window.parent.postMessage({ type: 'booking-page-preview-ready' }, '*')
    return () => window.removeEventListener('message', handleMessage)
  }, [previewMode])

  const isDark = theme === 'dark'
  const showReceptionist = config.showReceptionistOnBookingPage && Boolean(agentId)
  const showBookingFlow = !config.receptionistOnly && services.length > 0

  const receptionistBlock = showReceptionist && agentId && (
    <ReceptionistPanel
      organizationId={organizationId}
      agentId={agentId}
      agentName={agentName}
      backgroundImageUrl={config.backgroundImageUrl}
      showPhoneFallback={config.showPhoneFallback}
    />
  )

  if (config.receptionistOnly) {
    return receptionistBlock ? (
      <>{receptionistBlock}</>
    ) : (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Receptionist is not configured for this booking page.
      </div>
    )
  }

  const tabBar = (
    <div className={cn('flex gap-1 rounded-full border p-1', isDark ? 'border-zinc-800' : 'border-border')}>
      <button
        type="button"
        onClick={() => setTab('book')}
        className={cn(
          'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
          tab === 'book'
            ? isDark
              ? 'bg-zinc-100 text-zinc-900'
              : 'bg-foreground text-background'
            : 'text-muted-foreground'
        )}
      >
        Book appointment
      </button>
      <button
        type="button"
        onClick={() => setTab('manage')}
        className={cn(
          'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
          tab === 'manage'
            ? isDark
              ? 'bg-zinc-100 text-zinc-900'
              : 'bg-foreground text-background'
            : 'text-muted-foreground'
        )}
      >
        Reschedule / Cancel
      </button>
    </div>
  )

  const bookingFlowBlock = showBookingFlow && (
    <div className="space-y-4">
      {tabBar}
      {tab === 'book' ? (
        <BookingFlow
          organizationId={organizationId}
          organizationName={organizationName}
          services={services}
          staff={staff}
          theme={theme}
          accent={initialAccent}
          showServiceDescriptions={config.showServiceDescriptions}
          showPrices={config.showPrices}
          customFields={config.customFields}
        />
      ) : (
        <ManageBookingFlow organizationId={organizationId} theme={theme} accent={initialAccent} />
      )}
    </div>
  )

  const headerRow = config.showHeader && (
    <div className="flex items-center justify-between gap-4 border-b px-6 py-4 sm:px-10">
      <div className="flex items-center gap-2">
        {config.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.logoUrl} alt={organizationName} className="h-6 w-auto object-contain" />
        )}
        <p className="font-semibold">{organizationName}</p>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-4" />
        <span>{formatTimezoneOffset(timezone)}</span>
      </div>
    </div>
  )

  const rightPanel = (
    <div className={cn('flex h-full flex-col overflow-y-auto', isDark ? 'bg-zinc-950' : 'bg-background')}>
      {headerRow}
      <div className="flex-1 space-y-6 px-6 py-6 sm:px-10">
        <div className="space-y-1">
          <h1
            className={cn(HEADING_SIZE_CLASS[config.headingSize], 'font-semibold')}
            style={{ fontFamily: config.headingFont }}
          >
            {config.tagline ?? 'Pick a service'}
          </h1>
          {config.businessDescription && (
            <p
              className={cn(BODY_SIZE_CLASS[config.bodySize], isDark ? 'text-zinc-400' : 'text-muted-foreground')}
            >
              {config.businessDescription}
            </p>
          )}
        </div>

        {bookingFlowBlock}
      </div>
    </div>
  )

  const showMobileSplit = showReceptionist && showBookingFlow

  return (
    <div
      className={cn(
        'isolate flex h-svh flex-col overflow-hidden lg:flex-row',
        isDark ? 'text-zinc-100' : 'text-foreground',
        FONT_WEIGHT_CLASS[config.fontWeight],
        LINE_HEIGHT_CLASS[config.lineHeight],
        LETTER_SPACING_CLASS[config.letterSpacing]
      )}
      style={{ fontFamily: config.bodyFont }}
    >
      <div
        className={cn(
          'min-h-0 flex-1 lg:flex lg:w-1/2 lg:shrink-0',
          showMobileSplit && mobilePanel !== 'assistant' ? 'hidden' : 'flex'
        )}
      >
        {config.receptionistPosition === 'left' ? receptionistBlock : rightPanel}
      </div>
      <div
        className={cn(
          'min-h-0 flex-1 border-border lg:flex lg:w-1/2 lg:shrink-0 lg:border-l',
          showMobileSplit && mobilePanel !== 'steps' ? 'hidden' : 'flex'
        )}
      >
        {config.receptionistPosition === 'left' ? rightPanel : receptionistBlock}
      </div>

      {showMobileSplit && (
        <div className="shrink-0 border-t px-3 py-2.5 lg:hidden">
          <div
            role="tablist"
            className={cn(
              'grid h-11 grid-cols-2 gap-1 rounded-[10px] border p-1',
              isDark ? 'border-zinc-800' : 'border-border'
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mobilePanel === 'steps'}
              onClick={() => setMobilePanel('steps')}
              className={cn(
                'rounded-[7px] px-3 text-sm font-medium transition-colors',
                mobilePanel === 'steps'
                  ? isDark
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              Step by step
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobilePanel === 'assistant'}
              onClick={() => setMobilePanel('assistant')}
              className={cn(
                'rounded-[7px] px-3 text-sm font-medium transition-colors',
                mobilePanel === 'assistant'
                  ? isDark
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              With assistant
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
