import { buildKnowledgeToolHandlers } from './tools/knowledge-handlers'
import { toLiveKitTools } from './livekit-tool-adapter'

/**
 * LiveKit adapter for the knowledge-retrieval tool. Behavior lives in
 * `tools/knowledge-handlers.ts` so the AssemblyAI provider shares it.
 *
 * `search_knowledge` only needs the organization id, but the shared handler
 * context is uniform across tools, so the unused ids are filled with empty
 * strings here. The worker gates this whole builder on
 * `agents.skip_knowledge_retrieval` before calling it.
 */
export function buildKnowledgeTools({ organizationId }: { organizationId: string }) {
  return toLiveKitTools(
    buildKnowledgeToolHandlers({ organizationId, agentId: '', conversationId: '' })
  )
}
