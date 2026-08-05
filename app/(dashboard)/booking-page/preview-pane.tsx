'use client'

import { useEffect, useRef, useState } from 'react'
import { Monitor, Tablet, Smartphone, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePreviewDraft } from './preview-draft-context'
import {
  BOOKING_PAGE_PREVIEW_MESSAGE_TYPE,
  type BookingPagePreviewMessage,
} from '@/app/smb/[slug]/booking-page-public-client'
import type { DraftPatch } from './preview-draft-context'
import { getPublicBookingPath } from '@/lib/public-booking-url'

type Device = 'desktop' | 'tablet' | 'mobile'
type Zoom = 100 | 75 | 50

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

export function PreviewPane({ slug, initialDraft }: { slug: string; initialDraft: DraftPatch }) {
  const { registerFrame } = usePreviewDraft()
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [device, setDevice] = useState<Device>('desktop')
  const [zoom, setZoom] = useState<Zoom>(100)
  const [ready, setReady] = useState(false)

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
    // Only re-send the initial snapshot when the frame becomes ready (e.g.
    // after a hard reload) — subsequent edits flow through reportDraft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return (
    <div className="sticky top-4 flex h-[calc(100vh-8rem)] flex-col rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
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

        <div className="flex items-center gap-1">
          {([100, 75, 50] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                zoom === z ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {z}%
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

      <div className="flex flex-1 items-start justify-center overflow-auto p-4">
        <div
          style={{
            width: DEVICE_WIDTH[device],
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
          className="h-[800px] max-w-full shrink-0"
        >
          <iframe
            ref={frameRef}
            src={`${getPublicBookingPath(slug)}?preview=1`}
            className="size-full rounded-md border bg-background"
            title="Booking page preview"
          />
        </div>
      </div>
    </div>
  )
}
