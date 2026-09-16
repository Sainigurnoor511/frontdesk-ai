import type { TranscriptMessage } from '@/lib/data/conversations-service'

/**
 * The `timeline` artifact from `GET /v1/sessions/{id}` — the whole conversation,
 * turn by turn.
 *
 * These field names are verified against a live session artifact, not inferred
 * from prose. The distinction matters: the docs describe the timeline narratively
 * and a reasonable reading suggests a single `started_at_ms` per turn, which does
 * not exist. Real turns carry *separate* timestamps for the caller's speech and
 * the agent's reply, and the session's zero point is top-level.
 *
 * A turn pairs what the caller said with how the agent replied. `user_transcript`
 * is null on agent-initiated turns (the greeting, where `trigger` is `"greeting"`),
 * and a turn can legitimately have neither field: an interruption before the agent
 * spoke, or a brief noise that opened a turn without resolving to a transcript.
 */
type AssemblyAiTimelineTurn = {
  turn_id?: string
  item_id?: string
  /** `completed` or `interrupted`. */
  status?: string
  /** e.g. `greeting` on the opening agent-initiated turn. */
  trigger?: string | null
  user_transcript?: string | null
  /** Absolute Unix epoch milliseconds. */
  user_speech_started_at_ms?: number | null
  user_speech_ended_at_ms?: number | null
  user_confidence?: number | null
  agent_text?: string | null
  agent_reply_started_at_ms?: number | null
  agent_reply_ended_at_ms?: number | null
  interrupted_at_ms?: number | null
  time_to_first_audio_ms?: number | null
}

export type AssemblyAiTimeline = {
  session_id?: string
  /** Session start, and the zero point for the relative timestamps we store. */
  started_at_unix_ms?: number | null
  turns?: AssemblyAiTimelineTurn[] | null
  config_changes?: unknown[] | null
}

export function parseAssemblyAiTimeline(raw: ArrayBuffer | string): AssemblyAiTimeline {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
  return JSON.parse(text) as AssemblyAiTimeline
}

function firstFiniteNumber(values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

/**
 * Flattens an AssemblyAI timeline into the app's existing transcript shape, so
 * conversations recorded on either provider render identically and
 * `generateCallSummary` / `shouldCreateCallerMessage` need no provider awareness.
 *
 * `timestampSeconds` is relative to the start of the call, matching what
 * `CallTranscriptCollector` produces on the LiveKit path — the conversation UI
 * uses it to seek the recording, so collapsing everything to 0 would silently
 * break transcript-to-audio sync.
 *
 * Turns with neither a caller utterance nor an agent reply are skipped rather than
 * emitted as empty messages.
 */
export function timelineToTranscript(timeline: AssemblyAiTimeline): TranscriptMessage[] {
  const turns = (timeline.turns ?? []).filter(
    (turn): turn is AssemblyAiTimelineTurn => Boolean(turn)
  )
  if (turns.length === 0) return []

  // Prefer the session's own start. Falling back to the earliest timestamp seen
  // keeps timings sane (just shifted) if that field is ever absent.
  const baseMs =
    firstFiniteNumber([timeline.started_at_unix_ms]) ??
    firstFiniteNumber(
      turns
        .flatMap((turn) => [turn.user_speech_started_at_ms, turn.agent_reply_started_at_ms])
        .filter((value): value is number => typeof value === 'number')
        .sort((a, b) => a - b)
    )

  const relativeSeconds = (absoluteMs: number | null | undefined): number => {
    if (baseMs === null || typeof absoluteMs !== 'number' || !Number.isFinite(absoluteMs)) return 0
    return Math.max(0, Math.round((absoluteMs - baseMs) / 1000))
  }

  const messages: TranscriptMessage[] = []

  for (const turn of turns) {
    const callerText = turn.user_transcript?.trim()
    if (callerText) {
      messages.push({
        role: 'caller',
        text: callerText,
        timestampSeconds: relativeSeconds(turn.user_speech_started_at_ms),
      })
    }

    // Agent text is already trimmed to what was actually spoken when the caller
    // barged in, so an interrupted turn records the truncated reply rather than
    // text the caller never heard.
    const agentText = turn.agent_text?.trim()
    if (agentText) {
      messages.push({
        role: 'agent',
        text: agentText,
        timestampSeconds: relativeSeconds(turn.agent_reply_started_at_ms),
      })
    }
  }

  return messages
}
