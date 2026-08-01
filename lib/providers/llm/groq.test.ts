import { describe, it, expect, vi } from 'vitest'

vi.mock('groq-sdk', () => {
  class MockGroq {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  businessName: 'Acme Dental',
                  hours: 'Mon-Fri 9am-5pm',
                  services: ['Cleanings', 'Whitening'],
                  suggestedIndustry: 'Dental',
                }),
              },
            },
          ],
        }),
      },
    }
  }

  return { default: MockGroq }
})

import { createGroqProvider } from './groq'

describe('createGroqProvider', () => {
  it('extracts structured business info from page text', async () => {
    const provider = createGroqProvider()
    const result = await provider.extractBusinessInfo('Acme Dental is open Mon-Fri 9am-5pm...')
    expect(result).toEqual({
      businessName: 'Acme Dental',
      hours: 'Mon-Fri 9am-5pm',
      services: ['Cleanings', 'Whitening'],
      suggestedIndustry: 'Dental',
    })
  })
})
