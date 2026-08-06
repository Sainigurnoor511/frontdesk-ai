export type RankedChunkHit = {
  id: string
  content: string
  sourceType: 'knowledge_source' | 'faq'
  sourceId: string
  vectorSimilarity?: number
}

const RRF_K = 60

/**
 * Reciprocal rank fusion across multiple ranked lists (e.g. dense vector + lexical FTS).
 * Dedupes by chunk id and returns the top `limit` unique hits.
 */
export function fuseRankedChunkHits(
  rankedLists: RankedChunkHit[][],
  limit: number
): RankedChunkHit[] {
  const scores = new Map<string, { score: number; hit: RankedChunkHit }>()

  for (const list of rankedLists) {
    list.forEach((hit, rank) => {
      const rrf = 1 / (RRF_K + rank + 1)
      const existing = scores.get(hit.id)
      if (existing) {
        existing.score += rrf
        if (hit.vectorSimilarity !== undefined) {
          existing.hit.vectorSimilarity = hit.vectorSimilarity
        }
      } else {
        scores.set(hit.id, { score: rrf, hit })
      }
    })
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.hit)
}

export function hybridFetchPool(limit: number): number {
  return Math.max(limit * 2, 10)
}
