import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { chunkText } from '@/lib/knowledge/chunk-text'
import { embedPassageTexts, embedQueryText, isEmbeddingConfigured } from '@/lib/providers/embedding/client'
import { fuseRankedChunkHits, hybridFetchPool, type RankedChunkHit } from '@/lib/knowledge/hybrid-search'
import { crawlWebsite } from '@/lib/crawler/crawl'
import type { ScanDepth } from '@/lib/data/knowledge'

export type KnowledgeSnippet = {
  content: string
  sourceType: 'knowledge_source' | 'faq'
  sourceId: string
  similarity?: number
}

async function fetchSourceText(
  type: 'file' | 'website',
  storagePath: string | null,
  sourceUrl: string | null,
  scanDepth: ScanDepth | null
): Promise<string> {
  if (type === 'website') {
    if (!sourceUrl) throw new Error('Website source is missing a URL')
    return crawlWebsite(sourceUrl, scanDepth ?? 'quick')
  }

  if (!storagePath) throw new Error('File source is missing a storage path')

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.storage.from('knowledge-documents').download(storagePath)
  if (error || !data) {
    throw new Error(`Could not download knowledge file: ${error?.message ?? 'unknown error'}`)
  }

  const text = await data.text()
  if (!text.trim()) throw new Error('Uploaded file is empty')
  return text
}

async function deleteChunksForSource(
  organizationId: string,
  sourceType: 'knowledge_source' | 'faq',
  sourceId: string
): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('organization_id', organizationId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)

  if (error) {
    throw new Error(`Failed to delete old knowledge chunks: ${error.message}`)
  }
}

async function insertChunks(
  organizationId: string,
  sourceType: 'knowledge_source' | 'faq',
  sourceId: string,
  chunks: string[]
): Promise<void> {
  if (chunks.length === 0) return

  const supabase = createServiceRoleClient()
  let embeddings: number[][] | null = null

  if (isEmbeddingConfigured()) {
    embeddings = await embedPassageTexts(chunks)
  }

  const rows = chunks.map((content, index) => ({
    organization_id: organizationId,
    source_type: sourceType,
    source_id: sourceId,
    chunk_index: index,
    content,
    embedding: embeddings?.[index] ?? null,
  }))

  const { error } = await supabase.from('knowledge_chunks').insert(rows)
  if (error) {
    throw new Error(`Failed to insert knowledge chunks: ${error.message}`)
  }
}

export async function indexKnowledgeSourceServiceRole(sourceId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: source, error } = await supabase
    .from('knowledge_sources')
    .select('id, organization_id, type, source_url, storage_path, scan_depth')
    .eq('id', sourceId)
    .single()

  if (error || !source) {
    throw new Error(`Knowledge source ${sourceId} not found`)
  }

  await supabase
    .from('knowledge_sources')
    .update({ status: 'indexing', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', sourceId)

  try {
    const text = await fetchSourceText(
      source.type as 'file' | 'website',
      source.storage_path,
      source.source_url,
      source.scan_depth as ScanDepth | null
    )
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error('No text content found to index')
    }

    await deleteChunksForSource(source.organization_id, 'knowledge_source', sourceId)
    await insertChunks(source.organization_id, 'knowledge_source', sourceId, chunks)

    await supabase
      .from('knowledge_sources')
      .update({ status: 'ready', error_message: null, updated_at: new Date().toISOString() })
      .eq('id', sourceId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Indexing failed'
    await supabase
      .from('knowledge_sources')
      .update({
        status: 'failed',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)
    throw err
  }
}

export async function indexFaqServiceRole(faqId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: faq, error } = await supabase
    .from('faqs')
    .select('id, organization_id, question, answer')
    .eq('id', faqId)
    .single()

  if (error || !faq) {
    throw new Error(`FAQ ${faqId} not found`)
  }

  const text = `Question: ${faq.question}\n\nAnswer: ${faq.answer}`
  const chunks = chunkText(text)
  if (chunks.length === 0) {
    throw new Error('FAQ content is empty')
  }

  await deleteChunksForSource(faq.organization_id, 'faq', faqId)
  await insertChunks(faq.organization_id, 'faq', faqId, chunks)
}

export async function deleteKnowledgeChunksForSourceServiceRole(
  organizationId: string,
  sourceType: 'knowledge_source' | 'faq',
  sourceId: string
): Promise<void> {
  await deleteChunksForSource(organizationId, sourceType, sourceId)
}

function mapChunkRow(row: {
  id: string
  content: string
  source_type: string
  source_id: string
}): RankedChunkHit {
  return {
    id: row.id,
    content: row.content,
    sourceType: row.source_type as 'knowledge_source' | 'faq',
    sourceId: row.source_id,
  }
}

async function searchVectorHits(
  organizationId: string,
  query: string,
  poolSize: number
): Promise<RankedChunkHit[]> {
  const embedding = await embedQueryText(query)
  if (!embedding) return []

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: embedding,
    match_count: poolSize,
    p_organization_id: organizationId,
  })

  if (error || !data?.length) return []

  return (data as Array<{
    id: string
    content: string
    source_type: 'knowledge_source' | 'faq'
    source_id: string
    similarity: number
  }>).map((row) => ({
    ...mapChunkRow(row),
    vectorSimilarity: row.similarity,
  }))
}

async function searchLexicalHits(
  organizationId: string,
  query: string,
  poolSize: number
): Promise<RankedChunkHit[]> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('knowledge_chunks')
    .select('id, content, source_type, source_id')
    .eq('organization_id', organizationId)
    .textSearch('content', query, { type: 'websearch', config: 'english' })
    .limit(poolSize)

  if (!error && data?.length) {
    return data.map((row) => mapChunkRow(row as RankedChunkHit))
  }

  const { data: fallback } = await supabase
    .from('knowledge_chunks')
    .select('id, content, source_type, source_id')
    .eq('organization_id', organizationId)
    .ilike('content', `%${query.slice(0, 100)}%`)
    .limit(poolSize)

  return (fallback ?? []).map((row) => mapChunkRow(row as RankedChunkHit))
}

function toSnippets(hits: RankedChunkHit[]): KnowledgeSnippet[] {
  return hits.map((hit) => ({
    content: hit.content,
    sourceType: hit.sourceType,
    sourceId: hit.sourceId,
    similarity: hit.vectorSimilarity,
  }))
}

/**
 * Hybrid retrieval: FastEmbed BGE vectors (semantic) fused with Postgres FTS
 * (lexical, BM25-like) via reciprocal rank fusion. Runs in workers, not on Vercel.
 */
export async function searchKnowledgeServiceRole(
  organizationId: string,
  query: string,
  limit = 5
): Promise<KnowledgeSnippet[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const poolSize = hybridFetchPool(limit)

  if (isEmbeddingConfigured()) {
    try {
      const [vectorHits, lexicalHits] = await Promise.all([
        searchVectorHits(organizationId, trimmed, poolSize),
        searchLexicalHits(organizationId, trimmed, poolSize),
      ])

      const fused = fuseRankedChunkHits(
        [vectorHits, lexicalHits].filter((list) => list.length > 0),
        limit
      )

      if (fused.length > 0) {
        return toSnippets(fused)
      }
    } catch (err) {
      console.error('[knowledge] hybrid search failed, falling back to lexical only:', err)
    }
  }

  const lexicalOnly = await searchLexicalHits(organizationId, trimmed, limit)
  return toSnippets(lexicalOnly)
}
