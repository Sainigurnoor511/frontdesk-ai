const TEXT_FILE_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.html', '.htm'])

export function isSupportedKnowledgeFileName(filename: string): boolean {
  const lower = filename.toLowerCase()
  return [...TEXT_FILE_EXTENSIONS].some((ext) => lower.endsWith(ext))
}
