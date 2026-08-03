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

  it('prefixes the Fish Audio S2 tone tag and requests balanced latency', async () => {
    const mockBody = new ReadableStream()
    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockResolvedValue({ ok: true, body: mockBody } as Response)

    await synthesizeSpeech('How can I help you?', 'voice-123', '[friendly, warm]')

    const [, requestInit] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(requestInit!.body as string)
    expect(body.text).toBe('[friendly, warm] How can I help you?')
    expect(body.reference_id).toBe('voice-123')
    expect(body.latency).toBe('balanced')
  })

  it('decodes SSE audio chunks from the streaming endpoint when enabled', async () => {
    const encoder = new TextEncoder()
    const event = (payload: object) => `data: ${JSON.stringify(payload)}\n\n`
    const mockBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            event({ audio_base64: Buffer.from([1, 2, 3]).toString('base64') }) +
              event({ audio_base64: Buffer.from([4, 5]).toString('base64') })
          )
        )
        controller.close()
      },
    })
    const previous = process.env.FISH_AUDIO_TTS_STREAMING
    process.env.FISH_AUDIO_TTS_STREAMING = '1'
    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockResolvedValue({ ok: true, body: mockBody } as Response)

    try {
      const stream = await synthesizeSpeech('Hello')
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/v1/tts/stream/with-timestamp')

      const reader = stream.getReader()
      const chunks: number[][] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(Array.from(value))
      }
      expect(chunks).toEqual([
        [1, 2, 3],
        [4, 5],
      ])
    } finally {
      if (previous === undefined) delete process.env.FISH_AUDIO_TTS_STREAMING
      else process.env.FISH_AUDIO_TTS_STREAMING = previous
    }
  })
})
