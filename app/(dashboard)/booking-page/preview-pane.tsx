'use client'

import { useEffect, useRef, useState } from 'react'
import { Monitor, Tablet, Smartphone, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePreviewDraft } from './preview-draft-context'
import {
  BOOKING_PAGE_PREVIEW_MESSAGE_TYPE,
  BOOKING_PAGE_PREVIEW_TAB_MESSAGE_TYPE,
  type BookingPagePreviewMessage,
  type BookingPagePreviewTab,
} from '@/app/smb/[slug]/booking-page-public-client'
import type { DraftPatch } from './preview-draft-context'
import { getPublicBookingPath } from '@/lib/public-booking-url'

type Device = 'desktop' | 'tablet' | 'mobile'
type Zoom = 'fit' | 100 | 75 | 50

const DEVICE_FRAME: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
}

const PREVIEW_PADDING = 24

type PreviewLayout = {
  top: number
  left: number
  width: number
  height: number
  frameWidth: number
  frameHeight: number
  scale: number
}

function computePreviewLayout(
  containerWidth: number,
  containerHeight: number,
  device: Device,
  zoom: Zoom
): PreviewLayout {
  const availW = Math.max(containerWidth - PREVIEW_PADDING * 2, 0)
  const availH = Math.max(containerHeight - PREVIEW_PADDING * 2, 0)
  const { width: deviceW, height: deviceH } = DEVICE_FRAME[device]
  const aspect = deviceW / deviceH

  let width: number
  let height: number
  let frameWidth: number
  let frameHeight: number
  let scale: number

  if (device === 'desktop' && zoom === 'fit') {
    width = availW
    height = availH
    frameWidth = width
    frameHeight = height
    scale = 1
  } else if (zoom === 'fit') {
    if (availW / availH > aspect) {
      height = availH
      width = availH * aspect
    } else {
      width = availW
      height = availW / aspect
    }
    frameWidth = deviceW
    frameHeight = deviceH
    scale = width / deviceW
  } else {
    width = deviceW * (zoom / 100)
    height = deviceH * (zoom / 100)
    const clamp = Math.min(1, availW / width, availH / height)
    width *= clamp
    height *= clamp
    frameWidth = deviceW
    frameHeight = deviceH
    scale = width / deviceW
  }

  return {
    top: PREVIEW_PADDING + (availH - height) / 2,
    left: PREVIEW_PADDING + (availW - width) / 2,
    width,
    height,
    frameWidth,
    frameHeight,
    scale,
  }
}

export function PreviewPane({ slug, initialDraft }: { slug: string; initialDraft: DraftPatch }) {
  const { registerFrame } = usePreviewDraft()
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [device, setDevice] = useState<Device>('desktop')
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [previewTab, setPreviewTab] = useState<BookingPagePreviewTab>('book')
  const [ready, setReady] = useState(false)
  const [layout, setLayout] = useState<PreviewLayout>(() =>
    computePreviewLayout(0, 0, 'desktop', 'fit')
  )

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'booking-page-preview-ready') {
        setReady(true)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    registerFrame(frameRef.current)
    return () => registerFrame(null)
  }, [registerFrame])

  useEffect(() => {
    if (!ready || !frameRef.current?.contentWindow) return
    const message: BookingPagePreviewMessage = {
      type: BOOKING_PAGE_PREVIEW_MESSAGE_TYPE,
      ...initialDraft,
    }
    frameRef.current.contentWindow.postMessage(message, '*')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  useEffect(() => {
    if (!ready || !frameRef.current?.contentWindow) return
    frameRef.current.contentWindow.postMessage(
      { type: BOOKING_PAGE_PREVIEW_TAB_MESSAGE_TYPE, tab: previewTab },
      '*'
    )
  }, [ready, previewTab])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    function update() {
      const { width, height } = el!.getBoundingClientRect()
      setLayout(computePreviewLayout(width, height, device, zoom))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [device, zoom])

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-muted/20">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full border p-0.5">
            {(
              [
                ['book', 'Book appointment'],
                ['manage', 'Reschedule / Cancel'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreviewTab(id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  previewTab === id
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {(
              [
                ['desktop', Monitor],
                ['tablet', Tablet],
                ['mobile', Smartphone],
              ] as const
            ).map(([id, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDevice(id)}
                className={cn(
                  'flex size-7 items-center justify-center rounded transition-colors',
                  device === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
                )}
                aria-label={id}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {(['fit', 100, 75, 50] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                zoom === z ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {z === 'fit' ? 'Fit' : `${z}%`}
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => window.open(`${getPublicBookingPath(slug)}?preview=1`, '_blank')}
            aria-label="Open in new tab"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div ref={viewportRef} className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className="overflow-hidden rounded-lg bg-background shadow-lg ring-1 ring-black/5"
          style={{
            position: 'absolute',
            top: layout.top,
            left: layout.left,
            width: layout.width,
            height: layout.height,
            transition:
              'top 200ms ease-out, left 200ms ease-out, width 200ms ease-out, height 200ms ease-out',
          }}
        >
          <iframe
            ref={frameRef}
            src={`${getPublicBookingPath(slug)}?preview=1`}
            title="Booking page preview"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            className="border-0 bg-background"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: layout.frameWidth,
              height: layout.frameHeight,
              transform: `scale(${layout.scale})`,
              transformOrigin: 'top left',
              transition:
                'transform 200ms ease-out, width 200ms ease-out, height 200ms ease-out',
            }}
          />
        </div>
      </div>
    </div>
  )
}
