'use client'

import { Phone, X } from '@phosphor-icons/react/dist/ssr'
import { Orb } from '@/components/ui/orb'
import { Button } from '@/components/ui/button'
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{agentName}</DialogTitle>
          <DialogDescription>Start a call to your receptionist</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="size-32 overflow-hidden rounded-full">
            <Orb agentState={agentState} colors={['#DCE9FF', '#B9D3FF']} seed={1} />
          </div>

          {status === 'idle' || status === 'error' ? (
            <Button onClick={connect} className="gap-1.5">
              <Phone />
              {status === 'error' ? 'Try again' : 'Start call'}
            </Button>
          ) : status === 'connecting' ? (
            <p className="text-sm text-muted-foreground">Connecting…</p>
          ) : status === 'connected' ? (
            <Button onClick={disconnect} variant="destructive" className="gap-1.5">
              <X />
              End call
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Call ended</p>
          )}

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

          {staffPhoneNumber && (
            <p className="text-sm text-muted-foreground">Or call {staffPhoneNumber}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
