const DEFAULT_MAX_CHARS = 1200

/**
 * Split plain text into retrieval-sized chunks, preferring paragraph and
 * sentence boundaries over hard character cuts.
 */
export function chunkText(text: string, maxChars = DEFAULT_MAX_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n{2,}/)
  const chunks: string[] = []
  let current = ''

  function pushCurrent() {
    const trimmed = current.trim()
    if (trimmed) chunks.push(trimmed)
    current = ''
  }

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (!trimmed) continue

    if (trimmed.length > maxChars) {
      const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [trimmed]
      for (const sentence of sentences) {
        const piece = sentence.trim()
        if (!piece) continue
        const candidate = current ? `${current} ${piece}` : piece
        if (candidate.length > maxChars) {
          pushCurrent()
          current = piece.length > maxChars ? piece.slice(0, maxChars) : piece
        } else {
          current = candidate
        }
      }
      continue
    }

    const candidate = current ? `${current}\n\n${trimmed}` : trimmed
    if (candidate.length > maxChars) {
      pushCurrent()
      current = trimmed
    } else {
      current = candidate
    }
  }

  pushCurrent()
  return chunks
}
