import { getKnowledgeFileType } from '@/lib/knowledge/extract-file-text'

export function isSupportedKnowledgeFileName(filename: string): boolean {
  return getKnowledgeFileType(filename) !== null
}
