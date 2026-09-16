import { describe, it, expect } from 'vitest'
import { parseAssemblyAiTimeline, timelineToTranscript } from './timeline'

/**
 * The greeting turn below is a verbatim capture of a real `timeline` artifact from
 * a live AssemblyAI voice session, not a hand-written guess. It exists because the
 * timeline shape is only described narratively in AssemblyAI's docs, and a
 * reasonable reading of that prose suggests a per-turn `started_at_ms` that does
 * not actually exist — an assumption that collapsed every transcript timestamp to
 * zero before this was checked against the API.
 *
 * Keep it verbatim. If AssemblyAI changes the shape, this test should fail.
 */
const REAL_GREETING_TURN = {
  turn_id: 'resp_f16fde4617f643e1a18440422a7d5ce3',
  item_id: 'msg_0115bcb33a4746bda6f8de7e2720a906',
  status: 'completed',
  trigger: 'greeting',
  requested_instructions: null,
  user_transcript: null,
  user_speech_started_at_ms: null,
  user_speech_ended_at_ms: null,
  user_confidence: null,
  agent_text: 'Thanks for calling Probe Dental, how can I help?',
  agent_reply_started_at_ms: 1789575865640,
  agent_reply_ended_at_ms: 1789575867973,
  interrupted_at_ms: null,
  time_to_first_audio_ms: 348,
}

const SESSION_START_MS = 1789575865266

describe('timelineToTranscript', () => {
  it('maps a real captured greeting turn to a single agent message', () => {
    const transcript = timelineToTranscript({
      session_id: 'sess_3428f6110a214646b89210e9388bfa9c',
      started_at_unix_ms: SESSION_START_MS,
      turns: [REAL_GREETING_TURN],
    })

    // `user_transcript` is null on an agent-initiated turn, so no caller message.
    expect(transcript).toEqual([
      {
        role: 'agent',
        text: 'Thanks for calling Probe Dental, how can I help?',
        timestampSeconds: 0,
      },
    ])
  })

  it('times each side of a turn from its own timestamp, relative to session start', () => {
    const transcript = timelineToTranscript({
      started_at_unix_ms: SESSION_START_MS,
      turns: [
        REAL_GREETING_TURN,
        {
          turn_id: 'resp_2',
          status: 'completed',
          user_transcript: "I'd like to book a cleaning",
          user_speech_started_at_ms: SESSION_START_MS + 6_000,
          user_speech_ended_at_ms: SESSION_START_MS + 8_000,
          agent_text: 'Sure, what day works for you?',
          agent_reply_started_at_ms: SESSION_START_MS + 8_400,
        },
      ],
    })

    expect(transcript).toEqual([
      { role: 'agent', text: 'Thanks for calling Probe Dental, how can I help?', timestampSeconds: 0 },
      { role: 'caller', text: "I'd like to book a cleaning", timestampSeconds: 6 },
      { role: 'agent', text: 'Sure, what day works for you?', timestampSeconds: 8 },
    ])
  })

  it('skips turns with neither a caller utterance nor an agent reply', () => {
    // AssemblyAI documents this case: an interruption before the agent spoke, or a
    // brief noise that opened a turn without resolving to a transcript.
    const transcript = timelineToTranscript({
      started_at_unix_ms: SESSION_START_MS,
      turns: [
        { turn_id: 'resp_noise', status: 'interrupted', user_transcript: null, agent_text: null },
        REAL_GREETING_TURN,
      ],
    })

    expect(transcript).toHaveLength(1)
    expect(transcript[0].role).toBe('agent')
  })

  it('keeps the truncated reply from an interrupted turn', () => {
    const transcript = timelineToTranscript({
      started_at_unix_ms: SESSION_START_MS,
      turns: [
        {
          turn_id: 'resp_cut',
          status: 'interrupted',
          user_transcript: 'wait, stop',
          user_speech_started_at_ms: SESSION_START_MS + 2_000,
          agent_text: 'Our hours are nine to',
          agent_reply_started_at_ms: SESSION_START_MS + 1_000,
          interrupted_at_ms: SESSION_START_MS + 2_100,
        },
      ],
    })

    expect(transcript).toEqual([
      { role: 'caller', text: 'wait, stop', timestampSeconds: 2 },
      { role: 'agent', text: 'Our hours are nine to', timestampSeconds: 1 },
    ])
  })

  it('falls back to the earliest turn timestamp when the session start is absent', () => {
    const transcript = timelineToTranscript({
      turns: [
        {
          user_transcript: 'hello',
          user_speech_started_at_ms: SESSION_START_MS + 1_000,
          agent_text: 'Hi there',
          agent_reply_started_at_ms: SESSION_START_MS + 4_000,
        },
      ],
    })

    // Timings shift so the earliest event becomes zero, rather than degrading to
    // all-zero and silently breaking transcript-to-audio seeking.
    expect(transcript.map((message) => message.timestampSeconds)).toEqual([0, 3])
  })

  it('returns an empty transcript for a session with no turns', () => {
    expect(timelineToTranscript({ turns: [] })).toEqual([])
    expect(timelineToTranscript({})).toEqual([])
  })

  it('parses a raw artifact body', () => {
    const body = JSON.stringify({ started_at_unix_ms: SESSION_START_MS, turns: [REAL_GREETING_TURN] })
    const parsed = parseAssemblyAiTimeline(body)

    expect(parsed.started_at_unix_ms).toBe(SESSION_START_MS)
    expect(timelineToTranscript(parsed)).toHaveLength(1)
  })
})
