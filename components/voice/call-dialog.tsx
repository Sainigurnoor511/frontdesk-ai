'use client'

import { useEffect, useRef } from 'react'
import { Phone, PhoneX, ArrowUp, UserCircle } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/lib/utils'
import { Orb } from '@/components/ui/orb'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  agentId: string
  agentName: string
  staffPhoneNumber?: string | null
  authenticated: boolean
}) {
  const { status, agentState, errorMessage, transcript, connect, disconnect } = useVoiceCall(() =>
    authenticated
      ? startDashboardCall({ agentId })
      : startPublicCall({ organizationId, agentId })
  )

  const transcriptEndRef = useRef<HTMLDivElement>(null)

  function handleOpenChange(next: boolean) {
    if (!next) disconnect()
    onOpenChange(next)
  }

  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: 'end' })
  }, [transcript])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[512px] gap-0 rounded-3xl pt-6 pr-2 pb-2 pl-2 sm:max-w-[512px]">
        <DialogHeader className="items-center px-4 text-center">
          <DialogTitle className="text-lg font-semibold">{agentName}</DialogTitle>
          <DialogDescription>Start a call or chat to your receptionist</DialogDescription>
        </DialogHeader>

        {isConnected ? (
          <div className="mt-4 flex flex-col px-4">
            <div className="flex h-72 flex-col gap-3 overflow-y-auto scrollbar-thin pr-1">
              {transcript.length === 0 ? (
                <p className="m-auto text-sm text-muted-foreground">Listening…</p>
              ) : (
                transcript.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex items-end gap-2',
                      message.speaker === 'user' && 'flex-row-reverse'
                    )}
                  >
                    {message.speaker === 'agent' ? (
                      <div className="size-7 shrink-0 overflow-hidden rounded-full">
                        <Orb agentState={null} seed={1} />
                      </div>
                    ) : (
                      <UserCircle weight="fill" className="size-7 shrink-0 text-muted-foreground" />
                    )}
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                        message.speaker === 'agent'
                          ? 'rounded-bl-sm bg-muted text-foreground'
                          : 'rounded-br-sm bg-foreground text-background',
                        !message.final && 'opacity-70'
                      )}
                    >
                      {message.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>

            <button
              type="button"
              onClick={disconnect}
              aria-label="End call"
              className="mx-auto mt-4 flex size-14 items-center justify-center rounded-full border-4 border-background bg-red-500 text-white transition-transform hover:scale-105 active:scale-95"
            >
              <PhoneX weight="fill" className="size-5" />
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center px-4">
            <div className="relative">
              <div className="size-44 overflow-hidden rounded-full">
                <Orb agentState={agentState} seed={1} />
              </div>
              <button
                type="button"
                onClick={connect}
                disabled={isConnecting}
                aria-label="Start call"
                className="absolute -bottom-2 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full border-4 border-background bg-foreground text-white transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
              >
                <Phone weight="fill" className="size-5" />
              </button>
            </div>

            <p className="mt-6 h-4 text-sm text-muted-foreground">
              {isConnecting ? 'Connecting…' : ''}
            </p>

            {errorMessage && <p className="mt-1 text-sm text-destructive">{errorMessage}</p>}

            {staffPhoneNumber && (
              <div className="mt-5 flex flex-col items-center gap-2">
                <p className="text-sm text-muted-foreground">Or call</p>
                <span className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm font-medium shadow-[0px_2px_2px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.40)]">
                  {staffPhoneNumber}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex h-[124.4px] w-full max-w-[496px] flex-col gap-2 rounded-3xl border border-border bg-background p-3 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06),0px_0px_1px_0px_rgba(0,0,0,0.30)]">
          <textarea
            placeholder="Send a message..."
            disabled
            rows={2}
            className="flex-1 resize-none bg-transparent px-1.5 pt-1 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-end">
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
      </DialogContent>
    </Dialog>
  )
}
