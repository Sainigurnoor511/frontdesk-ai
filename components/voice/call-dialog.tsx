'use client'

import { useEffect, useRef } from 'react'
import {
  Phone,
  PhoneOff,
  ArrowUp,
  X,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Orb } from '@/components/ui/orb'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { useVoiceCall } from './use-voice-call'
import { startDashboardCall } from '@/app/(dashboard)/actions/voice'
import { startPublicCall } from '@/app/book/actions'

export function CallDialog({
  open,
  onOpenChange,
  organizationId,
  agentId,
  agentName,
  staffPhoneNumber,
  authenticated,
  turnstileToken,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  agentId: string
  agentName: string
  staffPhoneNumber?: string | null
  authenticated: boolean
  turnstileToken?: string | null
}) {
  const { status, agentState, errorMessage, transcript, connect, disconnect } = useVoiceCall(() =>
    authenticated
      ? startDashboardCall({ agentId })
      : startPublicCall({ organizationId, agentId, turnstileToken: turnstileToken ?? undefined })
  )

  const transcriptEndRef = useRef<HTMLDivElement>(null)

  function handleOpenChange(next: boolean) {
    if (!next) disconnect()
    onOpenChange(next)
  }

  const isConnecting = status === 'connecting'
  const isConnected = status === 'connected'
  const isEnded = status === 'ended'
  const hasTranscript = transcript.length > 0

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: 'end' })
  }, [transcript])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[80vh] max-w-[512px] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[512px]"
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          {isConnected ? (
            <span className="flex items-center gap-1.5 text-sm text-destructive">
              <span className="size-2 rounded-full bg-destructive" />
              On call
            </span>
          ) : (
            <span />
          )}
          <DialogClose
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-foreground hover:bg-muted"
          >
            <X className="size-3.5" />
          </DialogClose>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto px-4">
          {!isEnded && (
            <div className="flex flex-col items-center py-6 text-center">
              <h2 className="text-lg font-semibold">{agentName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isConnected ? 'Voice call active' : 'Start a call or chat to your receptionist'}
              </p>

              <div className="relative mt-6">
                <div className="size-44 overflow-hidden rounded-full">
                  <Orb agentState={agentState} seed={1} />
                </div>
                {isConnected ? (
                  <button
                    type="button"
                    onClick={disconnect}
                    aria-label="End call"
                    className="absolute -bottom-2 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full border-4 border-background bg-red-500 text-white transition-transform hover:scale-105 active:scale-95"
                  >
                    <PhoneOff fill="currentColor" className="size-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connect}
                    disabled={isConnecting}
                    aria-label="Start call"
                    className="absolute -bottom-2 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full border-4 border-background bg-foreground text-white transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
                  >
                    <Phone fill="currentColor" className="size-5" />
                  </button>
                )}
              </div>

              <p className="mt-6 h-4 text-sm text-muted-foreground">
                {isConnecting ? 'Connecting…' : ''}
              </p>

              {errorMessage && <p className="mt-1 text-sm text-destructive">{errorMessage}</p>}

              {staffPhoneNumber && !isConnected && (
                <div className="mt-5 flex flex-col items-center gap-2">
                  <p className="text-sm text-muted-foreground">Or call</p>
                  <span className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm font-medium shadow-[0px_2px_2px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.40)]">
                    {staffPhoneNumber}
                  </span>
                </div>
              )}
            </div>
          )}

          {hasTranscript && (
            <div className={cn('flex flex-col gap-3', !isEnded && 'pb-2', isEnded && 'py-4')}>
              {transcript.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex items-end gap-2',
                    message.speaker === 'user' && 'flex-row-reverse'
                  )}
                >
                  {message.speaker === 'agent' && (
                    <div className="size-7 shrink-0 overflow-hidden rounded-full">
                      <Orb agentState={null} seed={1} />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-3 py-2 text-sm text-black',
                      message.speaker === 'agent'
                        ? 'rounded-bl-sm bg-transparent'
                        : 'rounded-br-sm bg-[#f4f4f4]',
                      !message.final && 'opacity-70'
                    )}
                  >
                    {message.text}
                  </div>
                </div>
              ))}

              {isEnded && (
                <div className="mt-2 flex flex-col items-center gap-3 py-2">
                  <p className="text-sm text-muted-foreground">You ended the call</p>
                  <button
                    type="button"
                    onClick={connect}
                    className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-95"
                  >
                    <Plus className="size-4" />
                    New conversation
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <RotateCcw className="size-4" />
                    View details
                  </button>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 p-4 pt-2">
          <div className="flex h-[124.4px] w-full flex-col gap-2 rounded-3xl border border-border bg-background p-3 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06),0px_0px_1px_0px_rgba(0,0,0,0.30)]">
            <textarea
              placeholder="Send a message..."
              disabled
              rows={2}
              className="flex-1 resize-none bg-transparent px-1.5 pt-1 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-end gap-2">
              {isConnected && (
                <button
                  type="button"
                  onClick={disconnect}
                  aria-label="End call"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-red-200 bg-background text-red-500 transition-colors hover:bg-red-50"
                >
                  <PhoneOff fill="currentColor" className="size-4" />
                </button>
              )}
              <button
                type="button"
                disabled
                aria-label="Send message"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground disabled:cursor-not-allowed"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
