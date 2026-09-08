import type { AssemblyAiSessionConfig } from './providers/assemblyai/session-config'

/**
 * Hard cap on a single call, enforced on both providers. Mirrors the
 * `MAX_CALL_SECONDS` the LiveKit worker and the call-start actions already use.
 */
export const MAX_CALL_SECONDS = 300

/**
 * What a call-start action hands back to the browser.
 *
 * Discriminated on `provider` so one client hook can drive either transport, and
 * so adding a provider can't silently produce a payload the client half-handles.
 * The two shapes have almost nothing in common — LiveKit needs a room and a
 * WebRTC token; AssemblyAI needs a WebSocket URL, a single-use temp token, and
 * the full inline session configuration to send as its first frame.
 */
export type LiveKitCallSession = {
  provider: 'livekit'
  token: string
  url: string
  roomName: string
  conversationId: string
}

export type AssemblyAiCallSession = {
  provider: 'assemblyai'
  /** Single-use temporary token. Never the API key. */
  token: string
  wsUrl: string
  /** PCM16 mono sample rate for both capture and playback. */
  sampleRate: number
  conversationId: string
  /**
   * Inline configuration sent as the first `session.update`. Safe to expose to
   * the browser: the agent runs on AssemblyAI's managed LLM, so there is no
   * `llm.api_key`, and the function tools carry no credentials.
   */
  session: AssemblyAiSessionConfig
  maxCallSeconds: number
}

export type VoiceCallSession = LiveKitCallSession | AssemblyAiCallSession

export type StartCallResult = { error: string } | VoiceCallSession
