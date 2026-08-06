import { createClient } from '@/lib/supabase/server'

export type KnowledgeSourceStatus = 'pending' | 'indexing' | 'ready' | 'failed'
export type KnowledgeSourceType = 'file' | 'website'
export type ScanDepth = 'single' | 'quick' | 'deep'

export type KnowledgeSource = {
  id: string
  organizationId: string
  type: KnowledgeSourceType
  name: string
  sourceUrl: string | null
  storagePath: string | null
  scanDepth: ScanDepth | null
  status: KnowledgeSourceStatus
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export type Faq = {
  id: string
  organizationId: string
  question: string
  answer: string
  createdAt: string
  updatedAt: string
}

type KnowledgeSourceRow = {
  id: string
  organization_id: string
  type: KnowledgeSourceType
  name: string
  source_url: string | null
  storage_path: string | null
  scan_depth: ScanDepth | null
  status: KnowledgeSourceStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

type FaqRow = {
  id: string
  organization_id: string
  question: string
  answer: string
  created_at: string
  updated_at: string
}

function mapKnowledgeSource(row: KnowledgeSourceRow): KnowledgeSource {
  return {
    id: row.id,
    organizationId: row.organization_id,
    type: row.type,
    name: row.name,
    sourceUrl: row.source_url,
    storagePath: row.storage_path,
    scanDepth: row.scan_depth,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapFaq(row: FaqRow): Faq {
  return {
    id: row.id,
    organizationId: row.organization_id,
    question: row.question,
    answer: row.answer,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getKnowledgeSourcesForOrg(organizationId: string): Promise<KnowledgeSource[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('knowledge_sources')
    .select(
      'id, organization_id, type, name, source_url, storage_path, scan_depth, status, error_message, created_at, updated_at'
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return (data as KnowledgeSourceRow[]).map(mapKnowledgeSource)
}

export async function getFaqsForOrg(organizationId: string): Promise<Faq[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('faqs')
    .select('id, organization_id, question, answer, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return (data as FaqRow[]).map(mapFaq)
}
