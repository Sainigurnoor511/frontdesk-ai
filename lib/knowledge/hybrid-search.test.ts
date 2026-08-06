import { describe, it, expect } from 'vitest'
import { fuseRankedChunkHits } from './hybrid-search'

describe('fuseRankedChunkHits', () => {
  const hit = (
    id: string,
    content = `chunk ${id}`
  ): {
    id: string
    content: string
    sourceType: 'faq'
    sourceId: string
  } => ({
    id,
    content,
    sourceType: 'faq',
    sourceId: 'faq-1',
  })

  it('returns unique hits sorted by fused score', () => {
    const vector = [hit('a'), hit('b'), hit('c')]
    const lexical = [hit('b'), hit('d'), hit('a')]

    const fused = fuseRankedChunkHits([vector, lexical], 3)
    // b ranks high in both lists; a appears in both; d is lexical-only.
    expect(fused.map((row) => row.id)).toEqual(['b', 'a', 'd'])
  })

  it('respects the limit', () => {
    const fused = fuseRankedChunkHits(
      [[hit('a'), hit('b'), hit('c'), hit('d')]],
      2
    )
    expect(fused).toHaveLength(2)
  })
})
