import { PCM_WORKLET_NAME, pcmWorkletUrl } from './pcm-worklet'

/** ~50 ms per chunk. Chunk size isn't load-bearing for the API; this just keeps latency low. */
const CHUNK_MS = 50

export function encodeBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
  let binary = ''
  // Chunked to stay well under the argument-count limit of `String.fromCharCode`.
  const stride = 0x8000
  for (let i = 0; i < bytes.length; i += stride) {
    binary += String.fromCharCode(...bytes.subarray(i, i + stride))
  }
  return btoa(binary)
}

export function decodeBase64(value: string): Int16Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  // A trailing odd byte would misalign the view; drop it rather than throw.
  const usableBytes = bytes.byteLength - (bytes.byteLength % 2)
  return new Int16Array(bytes.buffer, 0, usableBytes / 2)
}

/**
 * Captures microphone audio as PCM16 at the Voice Agent API's sample rate.
 *
 * The mic constraints are deliberate and documented by AssemblyAI:
 *
 *  - `echoCancellation: true` is required. Without it the agent's TTS coming out
 *    of the speakers is re-captured, transcribed as caller speech, and the agent
 *    interrupts itself on every single reply.
 *  - `noiseSuppression: false` is required. The server already denoises, and a
 *    second layer costs more transcription accuracy than the noise it removes.
 *    Aggressiveness is tuned server-side via `voice_focus` instead.
 */
export class AssemblyAiAudioCapture {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null

  constructor(
    private readonly targetSampleRate: number,
    private readonly onChunk: (chunk: Int16Array) => void
  ) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
      },
    })

    // No `sampleRate` option on purpose — see the note in `pcm-worklet.ts`.
    this.context = new AudioContext()
    // Browsers gate context startup behind a user gesture; `connect()` is always
    // called from a click handler, but resuming explicitly covers the case where
    // the context still starts suspended.
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }

    await this.context.audioWorklet.addModule(pcmWorkletUrl())

    this.source = this.context.createMediaStreamSource(this.stream)
    this.worklet = new AudioWorkletNode(this.context, PCM_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: {
        targetSampleRate: this.targetSampleRate,
        chunkMs: CHUNK_MS,
      },
    })

    this.worklet.port.onmessage = (event: MessageEvent<Int16Array>) => {
      this.onChunk(event.data)
    }

    this.source.connect(this.worklet)
  }

  async stop(): Promise<void> {
    if (this.worklet) {
      this.worklet.port.onmessage = null
      this.worklet.disconnect()
      this.worklet = null
    }
    this.source?.disconnect()
    this.source = null

    for (const track of this.stream?.getTracks() ?? []) {
      track.stop()
    }
    this.stream = null

    if (this.context) {
      await this.context.close().catch(() => {})
      this.context = null
    }
  }
}

/**
 * Plays the agent's `reply.audio` chunks.
 *
 * Chunks are scheduled back-to-back on the AudioContext clock rather than paced
 * with timers. The scheduled queue absorbs network jitter, so a late frame doesn't
 * create a gap; sleep-based pacing drifts and produces pops.
 *
 * Playback uses a default-rate context and creates 24 kHz buffers — the context
 * resamples on output, which is well supported everywhere.
 */
export class AssemblyAiAudioPlayback {
  private context: AudioContext | null = null
  private gain: GainNode | null = null
  private active = new Set<AudioBufferSourceNode>()
  private nextStartTime = 0

  constructor(private readonly sampleRate: number) {}

  async start(): Promise<void> {
    this.context = new AudioContext()
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
    this.gain = this.context.createGain()
    this.gain.connect(this.context.destination)
    this.nextStartTime = this.context.currentTime
  }

  enqueue(samples: Int16Array): void {
    const context = this.context
    const gain = this.gain
    if (!context || !gain || samples.length === 0) return

    const buffer = context.createBuffer(1, samples.length, this.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) {
      // Asymmetric scaling matches the encode side and keeps full-scale negative
      // samples from overflowing to +1.0.
      channel[i] = samples[i] / (samples[i] < 0 ? 0x8000 : 0x7fff)
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(gain)

    // If the queue has drained (or we're starting fresh), begin slightly ahead of
    // `currentTime` so the first chunk isn't scheduled in the past and dropped.
    const startAt = Math.max(this.nextStartTime, context.currentTime + 0.02)
    source.start(startAt)
    this.nextStartTime = startAt + buffer.duration

    this.active.add(source)
    source.onended = () => {
      this.active.delete(source)
    }
  }

  /**
   * Drops everything queued but not yet heard. Called on barge-in, so the caller
   * doesn't keep hearing a reply they already talked over.
   */
  flush(): void {
    for (const source of this.active) {
      try {
        source.onended = null
        source.stop()
        source.disconnect()
      } catch {
        // Already finished; nothing to stop.
      }
    }
    this.active.clear()
    if (this.context) {
      this.nextStartTime = this.context.currentTime
    }
  }

  /** True while there is still scheduled audio to hear. */
  get isPlaying(): boolean {
    if (!this.context) return false
    return this.nextStartTime > this.context.currentTime + 0.01
  }

  async stop(): Promise<void> {
    this.flush()
    this.gain?.disconnect()
    this.gain = null
    if (this.context) {
      await this.context.close().catch(() => {})
      this.context = null
    }
  }
}
