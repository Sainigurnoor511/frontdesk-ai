/**
 * Low-level HTTP client for AssemblyAI's Voice Agent API.
 *
 * Worker-safe: no `server-only`-tainted imports, so the webhook worker can use
 * it to fetch session artifacts.
 *
 * Note there is no EU host for this product. Pre-recorded STT and LLM Gateway
 * publish `api.eu.` / `llm-gateway.eu.` variants, but the Voice Agent API
 * documents a single base URL. If EU data residency becomes a requirement, this
 * provider can't satisfy it and the LiveKit path is the fallback.
 */
const AGENTS_BASE_URL = 'https://agents.assemblyai.com'

export const ASSEMBLYAI_WS_URL = 'wss://agents.assemblyai.com/v1/ws'

/**
 * Audio is PCM16 mono at 24 kHz in both directions, base64-encoded inside JSON
 * events (not raw binary frames — that's the *streaming STT* API, a different
 * product with a different protocol).
 */
export const ASSEMBLYAI_SAMPLE_RATE = 24_000

/**
 * Returns null rather than throwing when the key is absent, matching the
 * degrade-don't-crash convention used by `getLiveKitCredentials()` and
 * `getRecordingS3Config()`. Callers surface a user-facing error instead.
 */
export function getAssemblyAiApiKey(): string | null {
  return process.env.ASSEMBLYAI_API_KEY?.trim() || null
}

/**
 * The raw key is the documented form. A `Bearer ` prefix is also accepted and
 * stripped server-side, but raw matches how every other key in this codebase is
 * sent and avoids implying the two are interchangeable across AssemblyAI
 * products (they are not — plain STT rejects `Bearer`).
 */
function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: apiKey }
}

export class AssemblyAiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'AssemblyAiError'
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const apiKey = getAssemblyAiApiKey()
  if (!apiKey) {
    throw new AssemblyAiError('ASSEMBLYAI_API_KEY is not configured', 0)
  }

  const response = await fetch(`${AGENTS_BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...authHeaders(apiKey),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    ...(init.signal ? { signal: init.signal } : {}),
  })

  if (!response.ok) {
    // Error bodies are small JSON `{ detail }` or validation payloads; include
    // them verbatim since they name the offending field.
    const detail = await response.text().catch(() => '')
    throw new AssemblyAiError(
      `AssemblyAI ${init.method ?? 'GET'} ${path} failed (${response.status}): ${detail.slice(0, 500)}`,
      response.status
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * Mints a single-use temporary token so the browser can open the WebSocket
 * without ever seeing the API key.
 *
 * @param expiresInSeconds How long the token may be redeemed for (1–600).
 * @param maxSessionDurationSeconds Caps the resulting session (60–10800).
 *   Without it the session inherits the 3-hour maximum, so we pin it to the
 *   app's own call cap to bound worst-case spend on an abandoned tab.
 */
export async function mintVoiceAgentToken(options: {
  expiresInSeconds: number
  maxSessionDurationSeconds: number
}): Promise<string> {
  const params = new URLSearchParams({
    expires_in_seconds: String(options.expiresInSeconds),
    max_session_duration_seconds: String(options.maxSessionDurationSeconds),
  })

  const data = await request<{ token: string }>(`/v1/token?${params.toString()}`)
  return data.token
}

export type AssemblyAiArtifact = {
  /** One of `recording` | `timeline` | `metadata`. */
  type?: string
  name?: string
  url: string
}

export type AssemblyAiSession = {
  id?: string
  session_id?: string
  status: string
  agent_id?: string | null
  created_at?: string
  session_duration_seconds?: number | null
  audio_duration_seconds?: number | null
  artifacts?: AssemblyAiArtifact[] | null
}

/**
 * Full session record, including `artifacts` — short-lived pre-signed URLs for
 * the recording, the conversation timeline, and recording metadata. The array is
 * empty while a session is still active, and the URLs expire quickly, so always
 * re-fetch rather than persisting them.
 */
export async function getAssemblyAiSession(sessionId: string): Promise<AssemblyAiSession> {
  return request<AssemblyAiSession>(`/v1/sessions/${encodeURIComponent(sessionId)}`)
}

/**
 * Artifact URLs are already signed, so they must be fetched *without* the
 * Authorization header — sending one can cause the upstream store to reject the
 * request as doubly-authenticated.
 */
export async function downloadArtifact(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new AssemblyAiError(`Artifact download failed (${response.status})`, response.status)
  }
  return response.arrayBuffer()
}

export function findArtifact(
  session: AssemblyAiSession,
  type: 'recording' | 'timeline' | 'metadata'
): AssemblyAiArtifact | null {
  const artifacts = session.artifacts ?? []
  return (
    artifacts.find((artifact) => artifact.type === type) ??
    artifacts.find((artifact) => artifact.name?.includes(type)) ??
    null
  )
}
