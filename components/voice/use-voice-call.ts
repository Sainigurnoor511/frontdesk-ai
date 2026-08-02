'use client'

import { useCallback, useRef, useState } from 'react'
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client'
import type { AgentState } from '@/components/ui/orb'

type CallStatus = 'idle' | 'connecting' | 'connected' | 'ended' | 'error'

export function useVoiceCall(
  startCall: () => Promise<
    { error: string } | { token: string; url: string; roomName: string; conversationId: string }
  >
) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const roomRef = useRef<Room | null>(null)

  const connect = useCallback(async () => {
    setStatus('connecting')
    setErrorMessage(null)

    const result = await startCall()
    if ('error' in result) {
      setStatus('error')
      setErrorMessage(result.error)
      return
    }

    const room = new Room()
    roomRef.current = room

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach()
        el.autoplay = true
        document.body.appendChild(el)
      }
      setAgentState('talking')
    })

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setAgentState(speakers.length > 0 ? 'talking' : 'listening')
    })

    room.on(RoomEvent.Disconnected, () => {
      setStatus('ended')
      setAgentState(null)
    })

    try {
      await room.connect(result.url, result.token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setStatus('connected')
      setAgentState('listening')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Could not connect to the call.')
    }
  }, [startCall])

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect()
    roomRef.current = null
    setStatus('ended')
    setAgentState(null)
  }, [])

  return { status, agentState, errorMessage, connect, disconnect }
}
