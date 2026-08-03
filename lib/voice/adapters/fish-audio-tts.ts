import { AudioByteStream, shortuuid, tts, type APIConnectOptions } from '@livekit/agents'

const FISH_AUDIO_API_URL = 'https://api.fish.audio/v1/tts'
const FISH_AUDIO_STREAM_URL = 'https://api.fish.audio/v1/tts/stream/with-timestamp'

/**
 * Decodes Fish Audio's SSE streaming response (`/v1/tts/stream/with-timestamp`)
 * into raw audio bytes. Each `data:` event is JSON with an `audio_base64`
 * field; base64-decode and enqueue so audio can play as soon as the first
 * chunk is rendered, instead of waiting for the whole utterance.
 *
 * Enabled with `FISH_AUDIO_TTS_STREAMING=1` — this is the biggest lever for
 * time-to-first-audio, but it's opt-in until the streaming endpoint's behavior
 * with the free tier has been confirmed against a live account.
 */
function createSseAudioDecoder(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  let buffer = ''
  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          try {
            const parsed = JSON.parse(payload) as { audio_base64?: string }
            if (parsed.audio_base64) {
              controller.enqueue(Buffer.from(parsed.audio_base64, 'base64'))
            }
          } catch {
            // Malformed event; ignore and keep streaming.
          }
        }
      }
    },
  })
}

export async function synthesizeSpeech(
  text: string,
  voiceId?: string,
  tag?: string | null,
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const streaming = process.env.FISH_AUDIO_TTS_STREAMING === '1'
  const response = await fetch(streaming ? FISH_AUDIO_STREAM_URL : FISH_AUDIO_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
      'Content-Type': 'application/json',
      model: 's2.1-pro-free',
    },
    body: JSON.stringify({
      text: tag ? `${tag} ${text}` : text,
      format: 'pcm',
      sample_rate: 24000,
      latency: 'balanced',
      ...(voiceId ? { reference_id: voiceId } : {}),
    }),
    ...(signal ? { signal } : {}),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Fish Audio TTS request failed: ${response.status}`)
  }

  return streaming ? response.body.pipeThrough(createSseAudioDecoder()) : response.body
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

  constructor(
    private readonly voiceId?: string,
    private readonly options: { tag?: string | null } = {}
  ) {
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
    return new FishAudioChunkedStream(
      this,
      text,
      this.voiceId,
      this.options.tag,
      connOptions,
      signal
    )
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
    private readonly tag: string | null | undefined,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal
  ) {
    super(text, ttsInstance, connOptions, abortSignal)
  }

  protected async run(): Promise<void> {
    try {
      const stream = await synthesizeSpeech(
        this.inputText,
        this.voiceId,
        this.tag,
        this.abortSignal
      )
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
