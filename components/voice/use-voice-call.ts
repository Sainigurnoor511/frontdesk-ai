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
import type { StartCallResult } from '@/lib/voice/call-session'
import { AssemblyAiVoiceSession } from './assemblyai/session'

export type AgentState = null | 'thinking' | 'listening' | 'talking'

type CallStatus = 'idle' | 'connecting' | 'joining' | 'connected' | 'ended' | 'error'

export type TranscriptMessage = {
  id: string
  speaker: 'agent' | 'user'
  text: string
  final: boolean
}

/**
 * Provider-specific teardown and relay callbacks.
 *
 * LiveKit calls are ended server-side by deleting the room. AssemblyAI calls are
 * ended by the browser (it holds the WebSocket) and then need two extra round
 * trips the LiveKit path doesn't: reporting the session id so the transcript can
 * be fetched later, and relaying tool calls to be executed with real authority.
 */
export type VoiceCallHandlers = {
  endLiveKitCall?: (input: { roomName: string }) => Promise<unknown>
  endAssemblyAiCall?: (input: { conversationId: string }) => Promise<unknown>
  linkAssemblyAiSession?: (input: {
    conversationId: string
    sessionId: string
  }) => Promise<unknown>
  executeVoiceTool?: (input: {
    conversationId: string
    toolName: string
    arguments: Record<string, unknown>
  }) => Promise<{ result: unknown }>
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

type ActiveSession =
  | { provider: 'livekit'; roomName: string; conversationId: string }
  | { provider: 'assemblyai'; conversationId: string }

/**
 * Drives a voice call on whichever engine the agent is configured for.
 *
 * The provider isn't a prop — it comes back from the call-start action inside a
 * discriminated union, so no caller has to know or thread it through. Both
 * transports converge on one status/transcript/agent-state surface, which is what
 * lets `CallDialog` stay provider-agnostic.
 */
export function useVoiceCall(
  startCall: () => Promise<StartCallResult>,
  handlers: VoiceCallHandlers = {}
) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])

  const roomRef = useRef<Room | null>(null)
  const assemblyRef = useRef<AssemblyAiVoiceSession | null>(null)
  const attachedTracksRef = useRef<Array<{ track: RemoteTrack; element: HTMLMediaElement }>>([])
  const sessionRef = useRef<ActiveSession | null>(null)
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Held in a ref so the long-lived transport callbacks below don't need to be
  // rebuilt (and the effects re-run) every time the caller passes a fresh handler
  // object. Synced in an effect rather than during render, which the React
  // compiler rules correctly reject.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  const upsertTranscript = useCallback((update: TranscriptMessage) => {
    setTranscript((prev) => {
      const next = new Map(prev.map((message) => [message.id, message]))
      next.set(update.id, update)
      return Array.from(next.values())
    })
  }, [])

  const cleanupAttachedElements = useCallback(() => {
    for (const { track, element } of attachedTracksRef.current) {
      track.detach(element)
      element.remove()
    }
    attachedTracksRef.current = []
  }, [])

  const clearMaxDurationTimer = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current)
      maxDurationTimerRef.current = null
    }
  }, [])

  const teardownServerSession = useCallback((session: ActiveSession) => {
    if (session.provider === 'livekit') {
      void handlersRef.current.endLiveKitCall?.({ roomName: session.roomName })
      return
    }
    void handlersRef.current.endAssemblyAiCall?.({ conversationId: session.conversationId })
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
      for (const segment of segments) {
        upsertTranscript({
          id: segment.id,
          speaker,
          text: segment.text,
          final: segment.final,
        })
      }
    })

    room.on(RoomEvent.Disconnected, () => {
      cleanupAttachedElements()
      setStatus('ended')
      setAgentState(null)
      sessionRef.current = null
      roomRef.current = null
    })

    return room
  }, [cleanupAttachedElements, upsertTranscript])

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

  const disconnect = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null
    clearMaxDurationTimer()

    const assembly = assemblyRef.current
    if (assembly) {
      assemblyRef.current = null
      void assembly.close()
    }

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
      teardownServerSession(session)
    }
  }, [cleanupAttachedElements, clearMaxDurationTimer, teardownServerSession])

  const connectAssemblyAi = useCallback(
    async (result: Extract<StartCallResult, { provider: 'assemblyai' }>) => {
      sessionRef.current = { provider: 'assemblyai', conversationId: result.conversationId }

      const session = new AssemblyAiVoiceSession(result, {
        onSessionId: (sessionId) => {
          // Fire-and-forget: the id is only needed after the call, and blocking
          // audio on a round trip here would delay the greeting.
          void handlersRef.current.linkAssemblyAiSession?.({
            conversationId: result.conversationId,
            sessionId,
          })
        },
        onConnected: () => setStatus('connected'),
        onAgentState: setAgentState,
        onTranscript: upsertTranscript,
        onError: (message) => {
          setStatus('error')
          setErrorMessage(message)
        },
        onEnded: () => {
          setStatus((current) => (current === 'error' ? current : 'ended'))
          setAgentState(null)
        },
        onToolCall: async (name, args) => {
          const relay = handlersRef.current.executeVoiceTool
          if (!relay) return { error: 'tool_not_available' }
          const response = await relay({
            conversationId: result.conversationId,
            toolName: name,
            arguments: args,
          })
          return response.result
        },
      })

      assemblyRef.current = session
      setStatus('joining')

      await session.connect()

      maxDurationTimerRef.current = setTimeout(
        () => disconnect(),
        result.maxCallSeconds * 1000
      )
    },
    [disconnect, upsertTranscript]
  )

  const connectLiveKit = useCallback(
    async (result: Extract<StartCallResult, { provider: 'livekit' }>) => {
      sessionRef.current = {
        provider: 'livekit',
        roomName: result.roomName,
        conversationId: result.conversationId,
      }
      const room = ensureRoom()

      try {
        await room.prepareConnection(result.url, result.token)
      } catch {
        // Non-fatal: connect() still performs the full handshake.
      }
      await room.connect(result.url, result.token, { autoSubscribe: true })
      await room.localParticipant.setMicrophoneEnabled(true)
      setStatus('joining')
      setAgentState('listening')
    },
    [ensureRoom]
  )

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

    try {
      if (result.provider === 'assemblyai') {
        await connectAssemblyAi(result)
      } else {
        await connectLiveKit(result)
      }
    } catch (err) {
      const session = sessionRef.current
      sessionRef.current = null
      if (session) teardownServerSession(session)

      const assembly = assemblyRef.current
      assemblyRef.current = null
      void assembly?.close()

      resetRoom()
      setStatus('error')
      setErrorMessage(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser and try again.'
          : err instanceof Error
            ? err.message
            : 'Could not connect to the call.'
      )
    }
  }, [startCall, connectAssemblyAi, connectLiveKit, resetRoom, teardownServerSession])

  /**
   * Tab close and navigation. `pagehide` fires for both and is more reliable than
   * `beforeunload` on mobile Safari. Without this an AssemblyAI session survives
   * as a billable 30-second resume window after the tab is gone.
   */
  useEffect(() => {
    const handlePageHide = () => {
      const assembly = assemblyRef.current
      if (assembly) {
        assemblyRef.current = null
        void assembly.close()
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [])

  useEffect(() => {
    return () => {
      const session = sessionRef.current
      sessionRef.current = null
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current)

      const assembly = assemblyRef.current
      assemblyRef.current = null
      void assembly?.close()

      const room = roomRef.current
      if (room) {
        void room.localParticipant.setMicrophoneEnabled(false).finally(() => {
          void room.disconnect(true)
        })
      }
      roomRef.current = null
      cleanupAttachedElements()
      if (session) {
        teardownServerSession(session)
      }
    }
  }, [cleanupAttachedElements, teardownServerSession])

  return { status, agentState, errorMessage, transcript, connect, disconnect, prewarm }
}
