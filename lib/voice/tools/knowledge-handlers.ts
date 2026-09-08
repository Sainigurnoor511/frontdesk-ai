import { z } from 'zod'
import { searchKnowledgeServiceRole } from '@/lib/data/knowledge-service'
import { defineVoiceTool, type VoiceToolContext, type VoiceToolHandler } from './types'

/**
 * Knowledge-base retrieval during a call. Scoped to the call's organization id
 * (never LLM-supplied).
 *
 * Kept in its own module because `lib/data/knowledge-service` transitively
 * pulls in the crawler, `fastembed`, `pdf-parse`, and `mammoth`. Importing it
 * from the booking path would drag all of that into consumers (and tests) that
 * only care about appointments.
 */
function buildSearchKnowledge(context: VoiceToolContext): VoiceToolHandler {
  return defineVoiceTool({
    name: 'search_knowledge',
    description:
      'Search the business knowledge base for information to answer caller questions about policies, services, pricing, hours, FAQs, and other business-specific details. Use this before guessing when the caller asks something not covered in your general instructions.',
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe('Natural-language search query based on what the caller asked'),
    }),
    execute: async (args) => {
      try {
        const snippets = await searchKnowledgeServiceRole(context.organizationId, args.query, 5)
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
  })
}

export function buildKnowledgeToolHandlers(context: VoiceToolContext): VoiceToolHandler[] {
  return [buildSearchKnowledge(context)]
}
