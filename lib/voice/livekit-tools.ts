import { buildVoiceToolHandlers } from './tool-handlers'
import { toLiveKitTools } from './livekit-tool-adapter'
import type { VoiceToolContext } from './tools/types'

/**
 * The LiveKit worker's entire tool list, wrapped for `AgentSession`.
 *
 * This wraps `buildVoiceToolHandlers()` — the single provider-neutral
 * composition point — rather than adapting one handler module at a time, which
 * is what the two files this replaced (`booking-tools.ts` and
 * `knowledge-tools.ts`) did. That shape let a new handler module reach the
 * AssemblyAI path and silently skip LiveKit; going through the shared
 * composition point makes that drift impossible by construction.
 *
 * Only the worker and this file's own test import it, because `@livekit/agents`
 * must not enter a Next.js request graph.
 */
export function buildLiveKitTools(context: VoiceToolContext) {
  return toLiveKitTools(buildVoiceToolHandlers(context))
}
