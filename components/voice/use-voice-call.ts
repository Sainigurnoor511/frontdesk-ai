'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RoomOptions,
  type TranscriptionSegment,
} from 'livekit-client'
export type AgentState = null | 'thinking' | 'listening' | 'talking'

type CallStatus = 'idle' | 'connecting' | 'connected' | 'ended' | 'error'

export type TranscriptMessage = {
  id: string
  speaker: 'agent' | 'user'
  text: string
  final: boolean
}

/**
 * Explicit browser audio processing — without these, WebRTC leaves echo
 * cancellation, noise suppression and automatic gain control at browser
 * defaults, which makes calls sound distant and lets background noise leak
 * through. All three are universally supported and cheap.
 */
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: false,
  dynacast: false,
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
}

export function useVoiceCall(
  startCall: () => Promise<
    { error: string } | { token: string; url: string; roomName: string; conversationId: string }
  >
) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
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

  /**
   * Creates (once) and returns the shared Room instance, wiring up event
   * listeners a single time so reconnect after a hangup reuses them.
   */
  const ensureRoom = useCallback(() => {
    if (roomRef.current) return roomRef.current

    const room = new Room(ROOM_OPTIONS)
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

    room.on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], participant) => {
      const speaker: TranscriptMessage['speaker'] = participant?.isLocal ? 'user' : 'agent'
      setTranscript((prev) => {
        const next = new Map(prev.map((m) => [m.id, m]))
        for (const segment of segments) {
          next.set(segment.id, {
            id: segment.id,
            speaker,
            text: segment.text,
            final: segment.final,
          })
        }
        return Array.from(next.values())
      })
    })

    room.on(RoomEvent.Disconnected, () => {
      cleanupAttachedElements()
      setStatus('ended')
      setAgentState(null)
    })

    return room
  }, [cleanupAttachedElements])

  /**
   * Best-effort prewarm, call when the call UI opens (before the caller taps
   * "start"): warms DNS/TLS and, on LiveKit Cloud, pins the edge data center.
   * Uses the static endpoint only — no room/token is minted, so this has no
   * side effects if the caller never actually dials.
   */
  const prewarm = useCallback(async () => {
    try {
      const res = await fetch('/api/livekit/endpoint', { cache: 'no-store' })
      if (!res.ok) return
      const { url } = (await res.json()) as { url: string | null }
      if (!url) return
      await ensureRoom().prepareConnection(url)
    } catch {
      // Prewarm is an optimization; never let it block or surface errors.
    }
  }, [ensureRoom])

  const connect = useCallback(async () => {
    setStatus('connecting')
    setErrorMessage(null)
    setTranscript([])

    const result = await startCall()
    if ('error' in result) {
      setStatus('error')
      setErrorMessage(result.error)
      return
    }

    const room = ensureRoom()

    try {
      // Re-warm with the token so LiveKit Cloud selects the nearest edge and
      // the DNS/TLS cache is hot for the ICE handshake that follows.
      try {
        await room.prepareConnection(result.url, result.token)
      } catch {
        // Non-fatal: connect() still performs the full handshake.
      }
      await room.connect(result.url, result.token, { autoSubscribe: true })
      await room.localParticipant.setMicrophoneEnabled(true)
      setStatus('connected')
      setAgentState('listening')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Could not connect to the call.')
    }
  }, [startCall, ensureRoom])

  const disconnect = useCallback(() => {
    void roomRef.current?.disconnect()
    setStatus('ended')
    setAgentState(null)
  }, [])

  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect()
      roomRef.current = null
      cleanupAttachedElements()
    }
  }, [cleanupAttachedElements])

  return { status, agentState, errorMessage, transcript, connect, disconnect, prewarm }
}
