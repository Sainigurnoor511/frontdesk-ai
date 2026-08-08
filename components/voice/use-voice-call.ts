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

type CallStatus = 'idle' | 'connecting' | 'joining' | 'connected' | 'ended' | 'error'

type CallCredentials = {
  token: string
  url: string
  roomName: string
  conversationId: string
}

export type TranscriptMessage = {
  id: string
  speaker: 'agent' | 'user'
  text: string
  final: boolean
}

const PREPARED_CALL_TTL_MS = 2 * 60 * 1000

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
  startCall: () => Promise<{ error: string } | CallCredentials>
) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const roomRef = useRef<Room | null>(null)
  const attachedTracksRef = useRef<Array<{ track: RemoteTrack; element: HTMLMediaElement }>>([])
  const preparedCallRef = useRef<{ credentials: CallCredentials; preparedAt: number } | null>(null)

  const cleanupAttachedElements = useCallback(() => {
    for (const { track, element } of attachedTracksRef.current) {
      track.detach(element)
      element.remove()
    }
    attachedTracksRef.current = []
  }, [])

  const invalidatePreparedCall = useCallback(() => {
    preparedCallRef.current = null
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
        setStatus('connected')
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
      invalidatePreparedCall()
    })

    return room
  }, [cleanupAttachedElements, invalidatePreparedCall])

  /**
   * Best-effort prewarm when the call UI opens: warms DNS/TLS to LiveKit and,
   * when possible, mints a room/token early so the agent can join before the
   * caller taps start.
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

    try {
      const result = await startCall()
      if ('error' in result) return

      preparedCallRef.current = { credentials: result, preparedAt: Date.now() }
      await ensureRoom().prepareConnection(result.url, result.token)
    } catch {
      invalidatePreparedCall()
    }
  }, [ensureRoom, invalidatePreparedCall, startCall])

  const connect = useCallback(async () => {
    setStatus('connecting')
    setErrorMessage(null)
    setTranscript([])

    const prepared = preparedCallRef.current
    const preparedIsFresh =
      prepared && Date.now() - prepared.preparedAt < PREPARED_CALL_TTL_MS

    let credentials: CallCredentials | null = preparedIsFresh ? prepared.credentials : null
    if (!credentials) {
      const result = await startCall()
      if ('error' in result) {
        setStatus('error')
        setErrorMessage(result.error)
        return
      }
      credentials = result
    }

    preparedCallRef.current = null
    const room = ensureRoom()

    try {
      try {
        await room.prepareConnection(credentials.url, credentials.token)
      } catch {
        // Non-fatal: connect() still performs the full handshake.
      }
      await room.connect(credentials.url, credentials.token, { autoSubscribe: true })
      await room.localParticipant.setMicrophoneEnabled(true)
      setStatus('joining')
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
    invalidatePreparedCall()
  }, [invalidatePreparedCall])

  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect()
      roomRef.current = null
      cleanupAttachedElements()
      invalidatePreparedCall()
    }
  }, [cleanupAttachedElements, invalidatePreparedCall])

  return { status, agentState, errorMessage, transcript, connect, disconnect, prewarm }
}
