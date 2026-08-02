import {
  type AudioBuffer,
  mergeFrames,
  normalizeLanguage,
  stt,
  type APIConnectOptions,
} from '@livekit/agents'

export type TranscribeAudioResult = {
  text: string
  duration: number
}

/**
 * Encodes PCM audio frames as a WAV file, matching the request shape Fish Audio's
 * `/v1/asr` endpoint expects (`multipart/form-data` with an `audio` file field).
 */
function encodeWav(pcm: Uint8Array, sampleRate: number, channels: number): Buffer {
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.byteLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.byteLength, 40)
  return Buffer.concat([header, Buffer.from(pcm)])
}

/**
 * Calls Fish Audio's batch ASR endpoint (`POST /v1/asr`). There is no streaming/
 * WebSocket variant — this is a one-shot call over a complete utterance, the same
 * shape as Groq Whisper's REST endpoint.
 */
export async function transcribeAudio(
  wavBuffer: Buffer,
  options?: { language?: string; abortSignal?: AbortSignal }
): Promise<TranscribeAudioResult> {
  const form = new FormData()
  form.append('audio', new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }), 'audio.wav')
  if (options?.language) {
    form.append('language', options.language)
  }

  const response = await fetch('https://api.fish.audio/v1/asr', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
    },
    body: form,
    signal: options?.abortSignal,
  })

  if (!response.ok) {
    throw new Error(`Fish Audio ASR request failed: ${response.status}`)
  }

  const data = (await response.json()) as { text?: string; duration?: number }
  return { text: data.text ?? '', duration: data.duration ?? 0 }
}

/**
 * LiveKit Agents STT plugin for Fish Audio.
 *
 * @remarks
 * Fish Audio's `/v1/asr` endpoint is documented BETA and batch-only (send a complete
 * audio clip, get one transcript back) — there is no streaming/partial-results API.
 * This mirrors `@livekit/agents-plugin-openai`'s `STT.withGroq()` path exactly:
 * `capabilities.streaming` is `false`, `stream()` throws (the framework never calls
 * it for a non-streaming STT — `AgentSession` uses its own VAD to segment turns and
 * calls the concrete `recognize()` → our `_recognize()` per utterance instead).
 */
export class FishAudioSTT extends stt.STT {
  label = 'fishaudio.STT'

  get model(): string {
    return 'fish-audio-asr'
  }

  get provider(): string {
    return 'fish.audio'
  }

  constructor(private readonly language?: string) {
    super({ streaming: false, interimResults: false })
  }

  protected async _recognize(
    buffer: AudioBuffer,
    abortSignal?: AbortSignal
  ): Promise<stt.SpeechEvent> {
    const frame = mergeFrames(buffer)
    const wavBuffer = encodeWav(new Uint8Array(frame.data.buffer), frame.sampleRate, frame.channels)

    const result = await transcribeAudio(wavBuffer, { language: this.language, abortSignal })

    return {
      type: stt.SpeechEventType.FINAL_TRANSCRIPT,
      alternatives: [
        {
          text: result.text,
          language: normalizeLanguage(this.language ?? ''),
          startTime: 0,
          endTime: result.duration,
          confidence: 0,
        },
      ],
    }
  }

  stream(_options?: { connOptions?: APIConnectOptions }): stt.SpeechStream {
    throw new Error('Streaming is not supported on Fish Audio STT')
  }
}
