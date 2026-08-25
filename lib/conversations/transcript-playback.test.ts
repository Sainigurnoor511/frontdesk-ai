import { describe, expect, it } from 'vitest'
import { getActiveTranscriptIndex } from './transcript-playback'
import type { TranscriptMessage } from '@/lib/data/conversations'

const transcript: TranscriptMessage[] = [
  { role: 'agent', text: 'Hello', timestampSeconds: 0 },
  { role: 'caller', text: 'Hi', timestampSeconds: 5 },
  { role: 'agent', text: 'How can I help?', timestampSeconds: 12 },
]

describe('getActiveTranscriptIndex', () => {
  it('returns -1 for empty transcript', () => {
    expect(getActiveTranscriptIndex([], 10)).toBe(-1)
  })

  it('returns first line before any timestamp', () => {
    expect(getActiveTranscriptIndex(transcript, 0)).toBe(0)
    expect(getActiveTranscriptIndex(transcript, 4)).toBe(0)
  })

  it('returns matching line for mid-call times', () => {
    expect(getActiveTranscriptIndex(transcript, 5)).toBe(1)
    expect(getActiveTranscriptIndex(transcript, 11)).toBe(1)
    expect(getActiveTranscriptIndex(transcript, 12)).toBe(2)
  })

  it('keeps last line active after its timestamp', () => {
    expect(getActiveTranscriptIndex(transcript, 999)).toBe(2)
  })
})
