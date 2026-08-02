'use client'

import { Phone, X, ArrowUp } from '@phosphor-icons/react/dist/ssr'
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
  const { status, agentState, errorMessage, connect, disconnect } = useVoiceCall(() =>
    authenticated
      ? startDashboardCall({ agentId })
      : startPublicCall({ organizationId, agentId })
  )

  function handleOpenChange(next: boolean) {
    if (!next) disconnect()
    onOpenChange(next)
  }

  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-6">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="text-lg font-semibold">{agentName}</DialogTitle>
          <DialogDescription>Start a call or chat to your receptionist</DialogDescription>
        </DialogHeader>

        <div className="mt-6 flex flex-col items-center">
          <div className="relative">
            <div className="size-44 overflow-hidden rounded-full">
              <Orb agentState={agentState} colors={['#3B82F6', '#5EEAD4']} seed={1} />
            </div>
            <button
              type="button"
              onClick={isConnected ? disconnect : connect}
              disabled={isConnecting}
              aria-label={isConnected ? 'End call' : 'Start call'}
              className="absolute -bottom-2 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
            >
              {isConnected ? <X className="size-6" /> : <Phone weight="fill" className="size-6" />}
            </button>
          </div>

          <p className="mt-6 h-4 text-sm text-muted-foreground">
            {isConnecting ? 'Connecting…' : isConnected ? 'Call in progress' : ''}
          </p>

          {errorMessage && <p className="mt-1 text-sm text-destructive">{errorMessage}</p>}

          {staffPhoneNumber && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground">Or call</p>
              <span className="rounded-full border border-border bg-background px-4 py-1.5 text-sm font-medium">
                {staffPhoneNumber}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3">
          <input
            type="text"
            placeholder="Send a message..."
            disabled
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            disabled
            aria-label="Send message"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground disabled:cursor-not-allowed"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
