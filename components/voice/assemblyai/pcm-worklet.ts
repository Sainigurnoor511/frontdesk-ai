/**
 * AudioWorklet processor that turns live mic audio into the PCM16 chunks the
 * Voice Agent API expects.
 *
 * Shipped as a source string and loaded from a Blob URL rather than a file in
 * `public/`, so the worklet can't drift out of sync with this module and there's
 * no extra static asset to remember when deploying.
 *
 * Resampling happens *here*, in the worklet, rather than by constructing an
 * `AudioContext({ sampleRate: 24000 })`. That shortcut looks simpler but breaks
 * two of three browser engines:
 *
 *   - Firefox honors the option, but a non-default-rate context runs in a
 *     separate audio graph and only the default graph feeds the echo canceller.
 *     The agent then hears its own TTS through the mic and interrupts itself on
 *     every reply.
 *   - Safari ignores the option entirely and runs at the hardware rate (usually
 *     48 kHz). Sending those samples labelled as 24 kHz produces chipmunked audio.
 *
 * Letting the context run at its native rate and converting here works on all of
 * Chrome, Edge, Firefox, and Safari. Linear interpolation is more than adequate
 * for speech.
 */
export const PCM_WORKLET_NAME = 'frontdesk-pcm-capture'

const PCM_WORKLET_SOURCE = `
class FrontdeskPcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = (options && options.processorOptions) || {}
    this.targetSampleRate = opts.targetSampleRate || 24000
    // \`sampleRate\` is a global in the AudioWorkletGlobalScope and reflects the
    // context's real rate, which is the value we must resample *from*.
    this.step = sampleRate / this.targetSampleRate
    // Fractional read position into the current input block. Carried across
    // blocks so resampling doesn't click at every 128-sample boundary.
    this.position = 0
    this.chunkSamples = Math.round(this.targetSampleRate * (opts.chunkMs || 50) / 1000)
    this.pending = new Int16Array(this.chunkSamples)
    this.pendingLength = 0
  }

  flush() {
    if (this.pendingLength === 0) return
    const frame = this.pending.slice(0, this.pendingLength)
    this.port.postMessage(frame, [frame.buffer])
    this.pendingLength = 0
  }

  push(sample) {
    // Clamp before scaling: values outside [-1, 1] would wrap and produce
    // audible cracks instead of clean clipping.
    const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample
    this.pending[this.pendingLength++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    if (this.pendingLength >= this.chunkSamples) this.flush()
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const channel = input[0]
    if (!channel || channel.length === 0) return true

    const length = channel.length
    while (this.position < length) {
      const index = Math.floor(this.position)
      const frac = this.position - index
      const current = channel[index]
      const next = index + 1 < length ? channel[index + 1] : channel[length - 1]
      this.push(current + (next - current) * frac)
      this.position += this.step
    }
    this.position -= length

    return true
  }
}

registerProcessor('${PCM_WORKLET_NAME}', FrontdeskPcmCapture)
`

let cachedUrl: string | null = null

/** Blob URL for the processor, created once per page. */
export function pcmWorkletUrl(): string {
  if (!cachedUrl) {
    cachedUrl = URL.createObjectURL(
      new Blob([PCM_WORKLET_SOURCE], { type: 'application/javascript' })
    )
  }
  return cachedUrl
}
