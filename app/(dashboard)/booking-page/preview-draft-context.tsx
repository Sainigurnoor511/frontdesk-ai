'use client'

import { createContext, useContext, useMemo, useRef, useState } from 'react'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { BOOKING_PAGE_PREVIEW_MESSAGE_TYPE } from '@/app/smb/[slug]/booking-page-public-client'

export type DraftPatch = {
  theme?: 'light' | 'dark'
  accent?: string
  config?: Partial<BookingPageConfig>
}

type PreviewDraftContextValue = {
  /** Called by section components whenever local (unsaved) state changes. */
  reportDraft: (patch: DraftPatch) => void
  /** Called by the preview iframe once it's mounted and ready to receive messages. */
  registerFrame: (frame: HTMLIFrameElement | null) => void
}

const PreviewDraftContext = createContext<PreviewDraftContextValue | null>(null)

export function PreviewDraftProvider({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [, setTick] = useState(0)

  const value = useMemo<PreviewDraftContextValue>(
    () => ({
      reportDraft(patch) {
        const frame = frameRef.current
        if (!frame?.contentWindow) return
        frame.contentWindow.postMessage(
          { type: BOOKING_PAGE_PREVIEW_MESSAGE_TYPE, ...patch },
          '*'
        )
      },
      registerFrame(frame) {
        frameRef.current = frame
        setTick((t) => t + 1)
      },
    }),
    []
  )

  return <PreviewDraftContext.Provider value={value}>{children}</PreviewDraftContext.Provider>
}

export function usePreviewDraft(): PreviewDraftContextValue {
  const ctx = useContext(PreviewDraftContext)
  if (!ctx) {
    // Sections may render outside the editor (e.g. future standalone usage) —
    // fall back to a no-op instead of throwing.
    return { reportDraft: () => {}, registerFrame: () => {} }
  }
  return ctx
}
