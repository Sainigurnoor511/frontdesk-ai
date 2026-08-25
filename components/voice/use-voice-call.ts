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
  startCall: () => Promise<{ error: string } | CallCredentials>,
  endCall?: (input: { roomName: string }) => Promise<unknown>
) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const roomRef = useRef<Room | null>(null)
  const attachedTracksRef = useRef<Array<{ track: RemoteTrack; element: HTMLMediaElement }>>([])
  const sessionRef = useRef<{ roomName: string } | null>(null)
  const endCallRef = useRef(endCall)
  endCallRef.current = endCall

  const cleanupAttachedElements = useCallback(() => {
    for (const { track, element } of attachedTracksRef.current) {
      track.detach(element)
      element.remove()
    }
    attachedTracksRef.current = []
  }, [])

  const teardownServerRoom = useCallback((roomName: string) => {
    void endCallRef.current?.({ roomName })
  }, [])

  const resetRoom = useCallback(() => {
    cleanupAttachedElements()
    roomRef.current = null
  }, [cleanupAttachedElements])

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
      sessionRef.current = null
      roomRef.current = null
    })

    return room
  }, [cleanupAttachedElements])

  /** Warms DNS/TLS to LiveKit only — does not create a room or conversation. */
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

    sessionRef.current = { roomName: result.roomName }
    const room = ensureRoom()

    try {
      try {
        await room.prepareConnection(result.url, result.token)
      } catch {
        // Non-fatal: connect() still performs the full handshake.
      }
      await room.connect(result.url, result.token, { autoSubscribe: true })
      await room.localParticipant.setMicrophoneEnabled(true)
      setStatus('joining')
      setAgentState('listening')
    } catch (err) {
      sessionRef.current = null
      teardownServerRoom(result.roomName)
      resetRoom()
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Could not connect to the call.')
    }
  }, [startCall, ensureRoom, resetRoom, teardownServerRoom])

  const disconnect = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null

    const room = roomRef.current
    if (room) {
      void room.localParticipant.setMicrophoneEnabled(false).finally(() => {
        void room.disconnect(true)
      })
    }

    cleanupAttachedElements()
    roomRef.current = null
    setStatus('ended')
    setAgentState(null)

    if (session) {
      teardownServerRoom(session.roomName)
    }
  }, [cleanupAttachedElements, teardownServerRoom])

  useEffect(() => {
    return () => {
      const session = sessionRef.current
      sessionRef.current = null
      const room = roomRef.current
      if (room) {
        void room.localParticipant.setMicrophoneEnabled(false).finally(() => {
          void room.disconnect(true)
        })
      }
      roomRef.current = null
      cleanupAttachedElements()
      if (session) {
        teardownServerRoom(session.roomName)
      }
    }
  }, [cleanupAttachedElements, teardownServerRoom])

  return { status, agentState, errorMessage, transcript, connect, disconnect, prewarm }
}
