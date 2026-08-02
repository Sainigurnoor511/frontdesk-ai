import { AudioByteStream, shortuuid, tts, type APIConnectOptions } from '@livekit/agents'

export async function synthesizeSpeech(
  text: string,
  voiceId?: string
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
      'Content-Type': 'application/json',
      model: 's2.1-pro-free',
    },
    body: JSON.stringify({
      text,
      format: 'pcm',
      sample_rate: 24000,
      ...(voiceId ? { reference_id: voiceId } : {}),
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Fish Audio TTS request failed: ${response.status}`)
  }

  return response.body
}

const FISH_AUDIO_TTS_SAMPLE_RATE = 24000
const FISH_AUDIO_TTS_CHANNELS = 1

/**
 * LiveKit Agents TTS plugin for Fish Audio.
 *
 * @remarks
 * Fish Audio's REST TTS endpoint (`/v1/tts`) returns a single audio response body rather than a
 * bidirectional streaming protocol, so — like `@livekit/agents-plugin-openai`'s `TTS` — this is a
 * non-streaming (`ChunkedStream`-based) provider. `capabilities.streaming` is `false` and `stream()`
 * is unsupported, mirroring the OpenAI plugin's own implementation.
 */
export class FishAudioTTS extends tts.TTS {
  label = 'fishaudio.TTS'
  private abortController = new AbortController()

  get model(): string {
    return 'fish-audio-tts'
  }

  get provider(): string {
    return 'fish.audio'
  }

  constructor(private readonly voiceId?: string) {
    super(FISH_AUDIO_TTS_SAMPLE_RATE, FISH_AUDIO_TTS_CHANNELS, { streaming: false })
  }

  synthesize(
    text: string,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal
  ): FishAudioChunkedStream {
    const signal = abortSignal
      ? AbortSignal.any([abortSignal, this.abortController.signal])
      : this.abortController.signal
    return new FishAudioChunkedStream(this, text, this.voiceId, connOptions, signal)
  }

  stream(): tts.SynthesizeStream {
    throw new Error('Streaming is not supported on Fish Audio TTS')
  }

  async close(): Promise<void> {
    this.abortController.abort()
  }
}

class FishAudioChunkedStream extends tts.ChunkedStream {
  label = 'fishaudio.ChunkedStream'

  constructor(
    ttsInstance: FishAudioTTS,
    text: string,
    private readonly voiceId: string | undefined,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal
  ) {
    super(text, ttsInstance, connOptions, abortSignal)
  }

  protected async run(): Promise<void> {
    try {
      const stream = await synthesizeSpeech(this.inputText, this.voiceId)
      const reader = stream.getReader()
      const requestId = shortuuid()
      const audioByteStream = new AudioByteStream(
        FISH_AUDIO_TTS_SAMPLE_RATE,
        FISH_AUDIO_TTS_CHANNELS
      )

      let lastFrame: ReturnType<typeof audioByteStream.write>[number] | undefined
      const sendLastFrame = (segmentId: string, final: boolean) => {
        if (lastFrame) {
          this.queue.put({ requestId, segmentId, frame: lastFrame, final })
          lastFrame = undefined
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const frame of audioByteStream.write(value)) {
          sendLastFrame(requestId, false)
          lastFrame = frame
        }
      }
      for (const frame of audioByteStream.flush()) {
        sendLastFrame(requestId, false)
        lastFrame = frame
      }
      sendLastFrame(requestId, true)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      throw error
    } finally {
      this.queue.close()
    }
  }
}
