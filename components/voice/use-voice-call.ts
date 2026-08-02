'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const attachedTracksRef = useRef<Array<{ track: RemoteTrack; element: HTMLMediaElement }>>([])

  const cleanupAttachedElements = useCallback(() => {
    for (const { track, element } of attachedTracksRef.current) {
      // track.detach() only clears element.srcObject and pauses it — the real
      // livekit-client implementation deliberately keeps the element around
      // (it caches/recycles <audio> elements internally) rather than removing
      // it from the DOM. We still call detach() first to release the track's
      // internal reference to the element, but we must remove it from the DOM
      // ourselves or it leaks as an orphaned node in document.body.
      track.detach(element)
      element.remove()
    }
    attachedTracksRef.current = []
  }, [])

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
        attachedTracksRef.current.push({ track, element: el })
        setAgentState('talking')
      }
    })

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setAgentState(speakers.length > 0 ? 'talking' : 'listening')
    })

    room.on(RoomEvent.Disconnected, () => {
      cleanupAttachedElements()
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
  }, [startCall, cleanupAttachedElements])

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect()
    roomRef.current = null
    cleanupAttachedElements()
    setStatus('ended')
    setAgentState(null)
  }, [cleanupAttachedElements])

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect()
      roomRef.current = null
      cleanupAttachedElements()
    }
  }, [cleanupAttachedElements])

  return { status, agentState, errorMessage, connect, disconnect }
}
