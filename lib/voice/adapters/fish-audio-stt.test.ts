import { describe, it, expect, vi, beforeEach } from 'vitest'

global.fetch = vi.fn()

import { transcribeAudio } from './fish-audio-stt'

describe('transcribeAudio', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset()
  })

  it('posts multipart form data with the audio file and returns the transcript', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hello there', duration: 1.5 }),
    } as Response)

    const result = await transcribeAudio(Buffer.from('fake wav bytes'))

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('fish.audio/v1/asr'),
      expect.objectContaining({ method: 'POST' })
    )
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.body).toBeInstanceOf(FormData)
    expect(result).toEqual({ text: 'hello there', duration: 1.5 })
  })

  it('includes the language field when provided', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ text: '', duration: 0 }),
    } as Response)

    await transcribeAudio(Buffer.from('fake wav bytes'), { language: 'en' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const form = init?.body as FormData
    expect(form.get('language')).toBe('en')
  })

  it('throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(transcribeAudio(Buffer.from('x'))).rejects.toThrow()
  })
})
