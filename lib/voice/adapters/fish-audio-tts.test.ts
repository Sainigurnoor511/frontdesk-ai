import { describe, it, expect, vi } from 'vitest'

global.fetch = vi.fn()

import { synthesizeSpeech } from './fish-audio-tts'

describe('synthesizeSpeech', () => {
  it('calls Fish Audio API with the given text and returns an audio stream', async () => {
    const mockBody = new ReadableStream()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: mockBody,
    } as Response)

    const result = await synthesizeSpeech('Hello, how can I help you?')

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('fish.audio'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toBe(mockBody)
  })

  it('throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(synthesizeSpeech('test')).rejects.toThrow()
  })

  it('includes reference_id in the request body when a voiceId is given', async () => {
    const mockBody = new ReadableStream()
    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockResolvedValue({ ok: true, body: mockBody } as Response)

    await synthesizeSpeech('Hello', 'voice-123')

    const [, requestInit] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(requestInit!.body as string)
    expect(body.reference_id).toBe('voice-123')
  })

  it('omits reference_id when no voiceId is given', async () => {
    const mockBody = new ReadableStream()
    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockResolvedValue({ ok: true, body: mockBody } as Response)

    await synthesizeSpeech('Hello')

    const [, requestInit] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(requestInit!.body as string)
    expect(body.reference_id).toBeUndefined()
  })
})
