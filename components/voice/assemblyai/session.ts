import type { AssemblyAiCallSession } from '@/lib/voice/call-session'
import { AssemblyAiAudioCapture, AssemblyAiAudioPlayback, decodeBase64, encodeBase64 } from './audio'

export type AssemblyAiAgentState = null | 'thinking' | 'listening' | 'talking'

export type AssemblyAiTranscriptUpdate = {
  id: string
  speaker: 'agent' | 'user'
  text: string
  final: boolean
}

export type AssemblyAiSessionCallbacks = {
  onSessionId: (sessionId: string) => void
  onConnected: () => void
  onAgentState: (state: AssemblyAiAgentState) => void
  onTranscript: (update: AssemblyAiTranscriptUpdate) => void
  onError: (message: string) => void
  onEnded: () => void
  /** Runs a tool server-side and resolves with whatever should be sent back. */
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

/**
 * Error codes AssemblyAI documents as transient. Everything else is fatal and
 * should surface to the user rather than silently retry.
 */
const RETRYABLE_ERROR_CODES = new Set(['at_capacity', 'concurrency_exceeded', 'internal_error'])

type ServerEvent = {
  type: string
  // session.ready
  session_id?: string
  // reply.audio — note the asymmetry with input.audio, which uses `audio`.
  // Confirmed against the Voice Agent AsyncAPI spec: ReplyAudioPayload.data.
  data?: string
  // transcripts
  text?: string
  item_id?: string
  reply_id?: string
  interrupted?: boolean
  // reply.done
  status?: string
  // tool.call
  call_id?: string
  name?: string
  arguments?: Record<string, unknown>
  // session.error
  code?: string
  message?: string
}

/**
 * Drives one AssemblyAI Voice Agent call from the browser.
 *
 * Owns the WebSocket, mic capture, playback, and the tool-call round trip. The
 * API key is never involved — the socket is opened with a single-use temporary
 * token minted server-side.
 */
export class AssemblyAiVoiceSession {
  private socket: WebSocket | null = null
  private capture: AssemblyAiAudioCapture | null = null
  private playback: AssemblyAiAudioPlayback
  private ready = false
  private closing = false
  private endedHandled = false

  /**
   * Tool results may only be sent when `reply.done` is the most recent event.
   * Sending early lands mid-transition-phrase; sending late collides with a new
   * turn. So results accumulate here and drain when the turn closes.
   */
  private pendingToolResults: Array<{ call_id: string; result: string; is_error: boolean }> = []
  private lastEventWasReplyDone = false

  constructor(
    private readonly config: AssemblyAiCallSession,
    private readonly callbacks: AssemblyAiSessionCallbacks
  ) {
    this.playback = new AssemblyAiAudioPlayback(config.sampleRate)
  }

  async connect(): Promise<void> {
    // Ask for the mic before opening the socket. A denied permission prompt
    // should fail fast rather than leave a billable session open with no audio.
    this.capture = new AssemblyAiAudioCapture(this.config.sampleRate, (chunk) =>
      this.sendAudio(chunk)
    )
    await this.capture.start()
    await this.playback.start()

    const url = `${this.config.wsUrl}?token=${encodeURIComponent(this.config.token)}`
    const socket = new WebSocket(url)
    this.socket = socket

    socket.onopen = () => {
      // Sent immediately, without waiting for anything — the first
      // `session.update` is what initializes the session.
      this.send({ type: 'session.update', session: this.config.session })
    }

    socket.onmessage = (event: MessageEvent<string>) => {
      let parsed: ServerEvent
      try {
        parsed = JSON.parse(event.data) as ServerEvent
      } catch {
        return
      }
      this.handleEvent(parsed)
    }

    socket.onerror = () => {
      if (!this.closing) {
        this.callbacks.onError('Lost connection to the voice agent.')
      }
    }

    socket.onclose = () => {
      // A close without a preceding `session.ended` is an unexpected drop. We
      // don't attempt `session.resume`: that needs a brand-new single-use token,
      // which means another server round trip, and a receptionist call is short
      // enough that surfacing the failure is more honest than a silent stall.
      this.finishLocally()
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(payload))
  }

  private sendAudio(chunk: Int16Array): void {
    // Mic frames captured before `session.ready` are dropped rather than buffered.
    // Flushing a backlog at once would exceed real time and trip
    // `audio_rate_violation`, and the agent greets first anyway so nothing is lost.
    if (!this.ready) return
    this.send({ type: 'input.audio', audio: encodeBase64(chunk) })
  }

  private handleEvent(event: ServerEvent): void {
    switch (event.type) {
      case 'session.ready': {
        this.ready = true
        if (event.session_id) {
          this.callbacks.onSessionId(event.session_id)
        }
        this.callbacks.onConnected()
        this.callbacks.onAgentState('listening')
        break
      }

      case 'session.updated':
        break

      case 'input.speech.started': {
        this.lastEventWasReplyDone = false
        this.callbacks.onAgentState('listening')
        break
      }

      case 'input.speech.stopped': {
        this.callbacks.onAgentState('thinking')
        break
      }

      case 'transcript.user.delta': {
        if (event.item_id && typeof event.text === 'string') {
          // `text` is the full transcript so far for this item, so replacing by
          // `item_id` is correct — these are not incremental appends.
          this.callbacks.onTranscript({
            id: event.item_id,
            speaker: 'user',
            text: event.text,
            final: false,
          })
        }
        break
      }

      case 'transcript.user': {
        if (event.item_id && typeof event.text === 'string') {
          this.callbacks.onTranscript({
            id: event.item_id,
            speaker: 'user',
            text: event.text,
            final: true,
          })
        }
        break
      }

      case 'reply.started': {
        this.lastEventWasReplyDone = false
        this.callbacks.onAgentState('talking')
        break
      }

      case 'reply.audio': {
        if (event.data) {
          this.playback.enqueue(decodeBase64(event.data))
        }
        break
      }

      case 'transcript.agent': {
        const id = event.item_id ?? event.reply_id
        if (id && typeof event.text === 'string') {
          this.callbacks.onTranscript({
            id,
            speaker: 'agent',
            text: event.text,
            final: true,
          })
        }
        break
      }

      case 'reply.done': {
        this.lastEventWasReplyDone = true

        if (event.status === 'interrupted') {
          // Barge-in: drop audio the caller already talked over, and throw away
          // results from the turn that just died so they can't be delivered into
          // the next one.
          this.playback.flush()
          this.pendingToolResults = []
          this.callbacks.onAgentState('listening')
        } else {
          this.callbacks.onAgentState(this.playback.isPlaying ? 'talking' : 'listening')
        }

        this.flushToolResults()
        break
      }

      case 'tool.call': {
        void this.runTool(event)
        break
      }

      case 'session.error': {
        const code = event.code ?? 'unknown'
        const retryable = RETRYABLE_ERROR_CODES.has(code)
        console.error(`[assemblyai] session error ${code}: ${event.message ?? ''}`)
        this.callbacks.onError(
          retryable
            ? 'The voice service is busy. Please try again in a moment.'
            : 'The voice agent hit an error and had to stop.'
        )
        break
      }

      case 'session.ended': {
        this.finishLocally()
        break
      }

      default:
        break
    }
  }

  private async runTool(event: ServerEvent): Promise<void> {
    const callId = event.call_id
    const name = event.name
    if (!callId || !name) return

    let result: unknown
    let isError = false

    try {
      result = await this.callbacks.onToolCall(name, event.arguments ?? {})
    } catch (err) {
      console.error(`[assemblyai] tool ${name} threw:`, err)
      result = { error: 'tool_execution_failed' }
      isError = true
    }

    // A tool result is an `error` when the handler reported one, so the agent can
    // choose a recovery path rather than reading a failure out as if it worked.
    if (!isError && result && typeof result === 'object' && 'error' in result) {
      isError = true
    }

    this.pendingToolResults.push({
      call_id: callId,
      result: JSON.stringify(result ?? {}),
      is_error: isError,
    })

    // The tool may well have resolved after `reply.done` already fired, in which
    // case nothing else will come along to drain the queue.
    this.flushToolResults()
  }

  private flushToolResults(): void {
    if (!this.lastEventWasReplyDone || this.pendingToolResults.length === 0) return

    const results = this.pendingToolResults
    this.pendingToolResults = []
    for (const result of results) {
      this.send({ type: 'tool.result', ...result })
    }
  }

  /**
   * Ends the call.
   *
   * `session.end` matters for cost, not just tidiness: merely closing the socket
   * leaves the session alive for a 30-second resume window that is billed.
   */
  async close(): Promise<void> {
    if (this.closing) return
    this.closing = true

    this.send({ type: 'session.end' })

    await this.capture?.stop()
    this.capture = null
    await this.playback.stop()

    // Give the server a beat to emit `session.ended` and close with 1000 before
    // hanging up on it.
    const socket = this.socket
    if (socket && socket.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 500)
        socket.addEventListener('close', () => {
          clearTimeout(timer)
          resolve()
        })
      })
      if (socket.readyState === WebSocket.OPEN) socket.close()
    }
    this.socket = null

    this.finishLocally()
  }

  /** Idempotent local teardown; both `session.ended` and socket close land here. */
  private finishLocally(): void {
    if (this.endedHandled) return
    this.endedHandled = true
    this.ready = false
    void this.capture?.stop()
    this.capture = null
    void this.playback.stop()
    this.callbacks.onAgentState(null)
    this.callbacks.onEnded()
  }
}
