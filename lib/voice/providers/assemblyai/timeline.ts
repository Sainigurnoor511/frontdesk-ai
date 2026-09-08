import type { TranscriptMessage } from '@/lib/data/conversations-service'

/**
 * The `timeline` artifact from `GET /v1/sessions/{id}` — the whole conversation,
 * turn by turn.
 *
 * Each turn pairs what the caller said with how the agent replied.
 * `user_transcript` is null on agent-initiated turns (the greeting), and a turn
 * can legitimately have neither field: an interruption before the agent spoke,
 * or a brief noise that opened a turn without resolving to a transcript.
 */
type AssemblyAiTimelineTurn = {
  turn_id?: string
  user_transcript?: string | null
  agent_text?: string | null
  status?: string
  /** Absolute Unix epoch milliseconds. */
  started_at_ms?: number | null
  duration_ms?: number | null
  tool_calls?: unknown[] | null
}

export type AssemblyAiTimeline = {
  turns?: AssemblyAiTimelineTurn[] | null
}

export function parseAssemblyAiTimeline(raw: ArrayBuffer | string): AssemblyAiTimeline {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
  return JSON.parse(text) as AssemblyAiTimeline
}

/**
 * Flattens an AssemblyAI timeline into the app's existing transcript shape, so
 * conversations recorded on either provider render identically and
 * `generateCallSummary` / `shouldCreateCallerMessage` need no provider awareness.
 *
 * `timestampSeconds` is relative to the start of the call, matching what
 * `CallTranscriptCollector` produces on the LiveKit path. AssemblyAI reports
 * absolute epoch milliseconds, so the earliest turn becomes the zero point.
 *
 * Turns with neither a caller utterance nor an agent reply are skipped rather
 * than emitted as empty messages.
 */
export function timelineToTranscript(timeline: AssemblyAiTimeline): TranscriptMessage[] {
  const turns = (timeline.turns ?? []).filter(
    (turn): turn is AssemblyAiTimelineTurn => Boolean(turn)
  )
  if (turns.length === 0) return []

  const startTimes = turns
    .map((turn) => turn.started_at_ms)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const baseMs = startTimes.length > 0 ? Math.min(...startTimes) : null

  const relativeSeconds = (turn: AssemblyAiTimelineTurn): number => {
    if (baseMs === null || typeof turn.started_at_ms !== 'number') return 0
    return Math.max(0, Math.round((turn.started_at_ms - baseMs) / 1000))
  }

  const messages: TranscriptMessage[] = []

  for (const turn of turns) {
    const timestampSeconds = relativeSeconds(turn)

    const callerText = turn.user_transcript?.trim()
    if (callerText) {
      messages.push({ role: 'caller', text: callerText, timestampSeconds })
    }

    // Agent text is already trimmed to what was actually spoken when the caller
    // barged in, so an interrupted turn records the truncated reply rather than
    // text the caller never heard.
    const agentText = turn.agent_text?.trim()
    if (agentText) {
      messages.push({ role: 'agent', text: agentText, timestampSeconds })
    }
  }

  return messages
}
