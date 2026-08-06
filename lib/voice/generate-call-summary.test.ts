import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const createMock = vi.fn()

vi.mock('groq-sdk', () => {
  class MockGroq {
    chat = {
      completions: {
        create: createMock,
      },
    }
  }

  return { default: MockGroq }
})

import { generateCallSummary } from './generate-call-summary'

describe('generateCallSummary', () => {
  const originalApiKey = process.env.GROQ_API_KEY

  beforeEach(() => {
    createMock.mockReset()
    process.env.GROQ_API_KEY = 'test-key'
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'Caller booked a haircut for Tuesday.' } }],
    })
  })

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GROQ_API_KEY
    } else {
      process.env.GROQ_API_KEY = originalApiKey
    }
  })

  it('returns null for an empty transcript', async () => {
    await expect(generateCallSummary([])).resolves.toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns a trimmed summary from Groq', async () => {
    const summary = await generateCallSummary(
      [
        { role: 'caller', text: 'I need an appointment', timestampSeconds: 0 },
        { role: 'agent', text: 'Sure, what day works?', timestampSeconds: 2 },
      ],
      { businessName: 'Acme Salon' }
    )

    expect(summary).toBe('Caller booked a haircut for Tuesday.')
    expect(createMock).toHaveBeenCalledOnce()
  })

  it('skips generation when GROQ_API_KEY is missing', async () => {
    delete process.env.GROQ_API_KEY

    await expect(
      generateCallSummary([{ role: 'caller', text: 'Hi', timestampSeconds: 0 }])
    ).resolves.toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })
})
