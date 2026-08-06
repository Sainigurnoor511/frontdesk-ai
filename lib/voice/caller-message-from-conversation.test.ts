import { describe, expect, it } from 'vitest'
import {
  buildCallerMessageContent,
  shouldCreateCallerMessage,
} from '@/lib/voice/caller-message-from-conversation'

describe('shouldCreateCallerMessage', () => {
  it('creates a message when the call failed', () => {
    expect(shouldCreateCallerMessage('failed', [])).toBe(true)
  })

  it('creates a message when a call goal failed', () => {
    expect(
      shouldCreateCallerMessage('successful', [
        { name: 'Book appointment', status: 'failed', reasoning: 'No slots left' },
      ])
    ).toBe(true)
  })

  it('skips successful calls with no failed goals', () => {
    expect(
      shouldCreateCallerMessage('successful', [
        { name: 'Book appointment', status: 'success', reasoning: 'Done' },
      ])
    ).toBe(false)
  })
})

describe('buildCallerMessageContent', () => {
  it('prefers summary and last caller line', () => {
    const content = buildCallerMessageContent(
      'Caller wanted Saturday morning.',
      [
        { role: 'caller', text: 'Can I book Saturday?', timestampSeconds: 1 },
        { role: 'agent', text: 'Let me check.', timestampSeconds: 2 },
        { role: 'caller', text: 'Morning works best.', timestampSeconds: 3 },
      ],
      []
    )

    expect(content.summary).toBe('Caller wanted Saturday morning.')
    expect(content.quotedLine).toBe('Morning works best.')
  })
})
