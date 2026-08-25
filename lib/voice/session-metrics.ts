import * as agents from '@livekit/agents'
import { logMetrics, type AgentMetrics } from '@livekit/agents'

type TurnLatency = {
  eouMs: number
  sttMs: number
  llmTtftMs: number
  ttsTtfbMs: number
}

export type VoiceSessionMetricsContext = {
  conversationId: string
  roomName: string
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100
}

function emptyTurn(): TurnLatency {
  return { eouMs: 0, sttMs: 0, llmTtftMs: 0, ttsTtfbMs: 0 }
}

function summarizeTurn(turn: TurnLatency): number {
  return turn.eouMs + turn.sttMs + turn.llmTtftMs + turn.ttsTtfbMs
}

function formatMetricsPayload(metrics: AgentMetrics, conversationId: string) {
  const base = { conversationId, type: metrics.type }

  switch (metrics.type) {
    case 'llm_metrics':
      return {
        ...base,
        speechId: metrics.speechId,
        ttftMs: roundMs(metrics.ttftMs),
        durationMs: roundMs(metrics.durationMs),
        promptTokens: metrics.promptTokens,
        completionTokens: metrics.completionTokens,
      }
    case 'tts_metrics':
      return {
        ...base,
        speechId: metrics.speechId,
        ttfbMs: roundMs(metrics.ttfbMs),
        durationMs: roundMs(metrics.durationMs),
        audioDurationMs: roundMs(metrics.audioDurationMs),
        charactersCount: metrics.charactersCount,
      }
    case 'stt_metrics':
      return {
        ...base,
        durationMs: roundMs(metrics.durationMs),
        audioDurationMs: roundMs(metrics.audioDurationMs),
        streamed: metrics.streamed,
      }
    case 'eou_metrics':
      return {
        ...base,
        speechId: metrics.speechId,
        endOfUtteranceDelayMs: roundMs(metrics.endOfUtteranceDelayMs),
        transcriptionDelayMs: roundMs(metrics.transcriptionDelayMs),
        onUserTurnCompletedDelayMs: roundMs(metrics.onUserTurnCompletedDelayMs),
      }
    case 'vad_metrics':
      return {
        ...base,
        idleTimeMs: roundMs(metrics.idleTimeMs),
        inferenceDurationTotalMs: roundMs(metrics.inferenceDurationTotalMs),
        inferenceCount: metrics.inferenceCount,
      }
    default:
      return base
  }
}

/**
 * Hooks LiveKit pipeline metrics (STT, LLM TTFT, TTS TTFB, EOU) and logs per-turn
 * end-to-end latency estimates correlated by `speechId`.
 */
export function attachVoiceSessionMetrics(
  session: agents.AgentSession,
  context: VoiceSessionMetricsContext
): void {
  const turns = new Map<string, TurnLatency>()
  const { conversationId } = context

  const logTurnE2e = (speechId: string, reason: string) => {
    const turn = turns.get(speechId)
    if (!turn) return
    const e2eMs = roundMs(summarizeTurn(turn))
    if (e2eMs <= 0) return

    console.info('[voice-metrics] turn latency', {
      conversationId,
      roomName: context.roomName,
      speechId,
      reason,
      e2eMs,
      eouMs: roundMs(turn.eouMs),
      sttMs: roundMs(turn.sttMs),
      llmTtftMs: roundMs(turn.llmTtftMs),
      ttsTtfbMs: roundMs(turn.ttsTtfbMs),
    })
  }

  session.on(agents.AgentSessionEventTypes.MetricsCollected, (event) => {
    const { metrics } = event
    logMetrics(metrics)
    console.info('[voice-metrics] pipeline', formatMetricsPayload(metrics, conversationId))

    if (metrics.type === 'eou_metrics' && metrics.speechId) {
      const turn = turns.get(metrics.speechId) ?? emptyTurn()
      turn.eouMs =
        metrics.endOfUtteranceDelayMs +
        metrics.transcriptionDelayMs +
        metrics.onUserTurnCompletedDelayMs
      turns.set(metrics.speechId, turn)
    }

    if (metrics.type === 'stt_metrics' && metrics.durationMs > 0) {
      // Streaming STT often reports 0 duration; attach to the latest open turn if any.
      const latestSpeechId = [...turns.keys()].at(-1)
      if (latestSpeechId) {
        const turn = turns.get(latestSpeechId) ?? emptyTurn()
        turn.sttMs = Math.max(turn.sttMs, metrics.durationMs)
        turns.set(latestSpeechId, turn)
      }
    }

    if (metrics.type === 'llm_metrics' && metrics.speechId) {
      const turn = turns.get(metrics.speechId) ?? emptyTurn()
      turn.llmTtftMs = metrics.ttftMs
      turns.set(metrics.speechId, turn)
    }

    if (metrics.type === 'tts_metrics' && metrics.speechId) {
      const turn = turns.get(metrics.speechId) ?? emptyTurn()
      turn.ttsTtfbMs = metrics.ttfbMs
      turns.set(metrics.speechId, turn)
      logTurnE2e(metrics.speechId, 'tts_ttfb')
    }
  })

  session.on(agents.AgentSessionEventTypes.SessionUsageUpdated, (event) => {
    console.info('[voice-metrics] session usage', {
      conversationId,
      roomName: context.roomName,
      modelUsage: event.usage.modelUsage,
    })
  })
}

export function logVoiceStartupLatency(input: {
  conversationId: string
  roomName: string
  jobStartedAt: number
  roomConnectedAt: number
  agentFetchedAt: number
  agentReadyAt: number
  sessionStartedAt: number
  firstSpeakingAt: number
  agentPrefetched: boolean
}): void {
  const {
    conversationId,
    roomName,
    jobStartedAt,
    roomConnectedAt,
    agentFetchedAt,
    agentReadyAt,
    sessionStartedAt,
    firstSpeakingAt,
    agentPrefetched,
  } = input

  console.info('[voice-metrics] greeting startup', {
    conversationId,
    roomName,
    timeToFirstAudioMs: firstSpeakingAt - jobStartedAt,
    parallelConnectMs: roomConnectedAt - jobStartedAt,
    agentFetchMs: agentPrefetched ? 0 : agentFetchedAt - roomConnectedAt,
    greetingTtsMs: agentReadyAt - agentFetchedAt,
    sessionStartMs: sessionStartedAt - agentReadyAt,
    greetingPlaybackMs: firstSpeakingAt - sessionStartedAt,
    agentPrefetched,
  })
}
