'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Phone,
  PhoneOff,
  ArrowUp,
  X,
  Plus,
  RotateCcw,
  Bot,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Orb } from '@/components/ui/orb'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { useVoiceCall } from './use-voice-call'
import { startDashboardCall } from '@/app/(dashboard)/actions/voice'
import { startPublicCall } from '@/app/smb/actions'

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
  const { status, agentState, errorMessage, transcript, connect, disconnect, prewarm } = useVoiceCall(() =>
    authenticated
      ? startDashboardCall({ agentId })
      : startPublicCall({ organizationId, agentId, turnstileToken: turnstileToken ?? undefined })
  )

  const transcriptEndRef = useRef<HTMLDivElement>(null)

  function handleOpenChange(next: boolean) {
    if (!next) disconnect()
    onOpenChange(next)
  }

  useEffect(() => {
    if (open) void prewarm()
  }, [open, prewarm])

  const isConnecting = status === 'connecting'
  const isJoining = status === 'joining'
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
        className="flex h-[632.875px] max-h-[min(90vh,632.875px)] w-full max-w-[512px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[512px]"
      >
        <div className="relative flex h-full w-full flex-col">
          <div className="z-10 flex w-full shrink-0 items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              {isConnected && (
                <span className="flex items-center gap-1.5 text-sm text-destructive">
                  <span className="size-2 rounded-full bg-destructive" />
                  On call
                </span>
              )}
              {isJoining && (
                <span className="text-sm text-muted-foreground">Connecting to receptionist…</span>
              )}
            </div>
            <DialogClose
              aria-label="Close dialog"
              className="inline-flex size-8 items-center justify-center rounded-lg bg-transparent text-foreground transition-colors hover:bg-muted"
            >
              <X className="size-[18px]" strokeWidth={1.5} />
            </DialogClose>
          </div>

          <div
            className={cn(
              'relative min-h-0 flex-1 overflow-y-auto transition-all duration-500 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              !hasTranscript && !isEnded && 'flex flex-col'
            )}
          >
            {!isEnded && (
              <div
                className={cn(
                  'flex flex-col items-center gap-5 px-4',
                  !hasTranscript && 'h-full justify-center'
                )}
              >
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-base font-semibold text-foreground">{agentName}</span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {isConnected
                      ? 'Voice call active'
                      : isJoining
                        ? 'Your receptionist is joining…'
                        : 'Start a call or chat to your receptionist'}
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <Orb
                    agentState={agentState}
                    size={192}
                    className="overflow-hidden rounded-full"
                  />
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={disconnect}
                      aria-label="End voice call"
                      className="relative z-10 -mt-7 flex size-14 items-center justify-center rounded-full border-4 border-background bg-red-500 text-background transition-all hover:scale-105 active:scale-95"
                    >
                      <PhoneOff fill="currentColor" className="size-[18px]" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={connect}
                      disabled={isConnecting}
                      aria-label="Start voice call"
                      className="relative z-10 -mt-7 flex size-14 items-center justify-center rounded-full border-4 border-background bg-foreground text-background transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Phone fill="currentColor" className="size-[18px]" />
                    </button>
                  )}
                </div>

                {isConnecting && (
                  <p className="text-sm text-muted-foreground">Connecting…</p>
                )}

                {isJoining && !isConnecting && (
                  <p className="text-sm text-muted-foreground">Waiting for your receptionist…</p>
                )}

                {errorMessage && (
                  <p className="text-sm text-destructive">{errorMessage}</p>
                )}

                {staffPhoneNumber && !isConnected && (
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-sm text-muted-foreground">Or call</p>
                    <span className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm font-medium shadow-[0px_2px_2px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.40)]">
                      {staffPhoneNumber}
                    </span>
                  </div>
                )}

                {!staffPhoneNumber && !isConnected && authenticated && (
                  <p className="max-w-xs text-center text-sm font-normal text-muted-foreground">
                    You&apos;re testing online. To let customers reach your receptionist by phone,{' '}
                    <Link
                      href={`/agents/${agentId}?tab=call-settings`}
                      className="font-medium text-foreground hover:underline"
                      onClick={() => onOpenChange(false)}
                    >
                      add a phone number
                    </Link>
                    .
                  </p>
                )}
              </div>
            )}

            {hasTranscript && (
              <div className={cn('flex flex-col gap-3 px-4', !isEnded && 'pb-2', isEnded && 'py-4')}>
                {transcript.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex items-end gap-2',
                      message.speaker === 'user' && 'flex-row-reverse'
                    )}
                  >
                    {message.speaker === 'agent' && (
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Bot className="size-4" />
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

          <div className="relative shrink-0">
            <div className="bg-background p-2">
              <div className="flex flex-col gap-2 rounded-3xl bg-background p-3 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06),0px_0px_1px_0px_rgba(0,0,0,0.30)] dark:shadow-none dark:ring-1 dark:ring-border/50">
                <div className="px-1.5 pt-1 pb-1.5">
                  <textarea
                    placeholder="Send a message..."
                    disabled
                    rows={1}
                    className="w-full resize-none border-none bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
                    style={{ height: 36 }}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex flex-1 items-center gap-1.5" />
                  <button
                    type="button"
                    disabled
                    aria-label="Send message"
                    className="inline-flex size-10 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  >
                    <ArrowUp className="size-5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
