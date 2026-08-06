import { tool } from '@livekit/agents'
import { z } from 'zod'
import { searchKnowledgeServiceRole } from '@/lib/data/knowledge-service'

/**
 * LiveKit voice-agent tool for retrieving business knowledge during a call.
 * Scoped to the room's organization id (never LLM-supplied).
 */
export function buildKnowledgeTools({ organizationId }: { organizationId: string }) {
  return {
    search_knowledge: tool({
      description:
        'Search the business knowledge base for information to answer caller questions about policies, services, pricing, hours, FAQs, and other business-specific details. Use this before guessing when the caller asks something not covered in your general instructions.',
      parameters: z.object({
        query: z.string().min(1).describe('Natural-language search query based on what the caller asked'),
      }),
      execute: async (args) => {
        try {
          const snippets = await searchKnowledgeServiceRole(organizationId, args.query, 5)
          if (snippets.length === 0) {
            return { found: false, snippets: [] }
          }
          return {
            found: true,
            snippets: snippets.map((snippet) => ({
              content: snippet.content,
              sourceType: snippet.sourceType,
            })),
          }
        } catch (error) {
          console.error('[knowledge-tools] search_knowledge failed:', error)
          return { error: 'knowledge_search_failed' }
        }
      },
    }),
  }
}
