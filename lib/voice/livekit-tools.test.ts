import { describe, it, expect, vi } from 'vitest'

vi.mock('@livekit/agents', () => ({
  tool: (def: unknown) => def,
}))

// Symmetric with `tool-handlers.test.ts`: keeps `cheerio` and the crawler out
// of the graph so this suite stays fast.
vi.mock('@/lib/data/knowledge-service', () => ({
  searchKnowledgeServiceRole: vi.fn(),
}))

import { buildLiveKitTools } from './livekit-tools'

describe('buildLiveKitTools', () => {
  const context = {
    organizationId: 'org-1',
    agentId: 'agent-1',
    conversationId: 'conv-1',
  }

  it('gives the LiveKit worker every tool the shared composition point exposes', () => {
    expect(Object.keys(buildLiveKitTools(context))).toEqual([
      'check_availability',
      'book_appointment',
      'find_appointment',
      'cancel_appointment',
      'reschedule_appointment',
      'search_knowledge',
      'take_message',
    ])
  })

  it('honors skip_knowledge_retrieval, which now lives in the shared builder', () => {
    expect(
      Object.keys(buildLiveKitTools({ ...context, skipKnowledgeRetrieval: true }))
    ).not.toContain('search_knowledge')
  })
})
