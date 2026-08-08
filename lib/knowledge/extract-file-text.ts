import * as cheerio from 'cheerio'

export type KnowledgeFileType = 'text' | 'markdown' | 'html' | 'pdf' | 'docx'

const EXTENSION_TO_TYPE: Record<string, KnowledgeFileType> = {
  '.txt': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.pdf': 'pdf',
  '.docx': 'docx',
}

export function getKnowledgeFileType(filename: string): KnowledgeFileType | null {
  const lower = filename.toLowerCase()
  for (const [ext, type] of Object.entries(EXTENSION_TO_TYPE)) {
    if (lower.endsWith(ext)) return type
  }
  return null
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function extractHtmlText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, nav, footer, noscript').remove()
  return $('body').text().replace(/\s+/g, ' ').trim()
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // pdf-parse pulls in pdfjs-dist (~heavy). Load lazily so modules that import
  // this file (e.g. the voice agent's knowledge tools) don't pay the cost at
  // startup — it's only needed when a PDF is actually indexed.
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: bytes })
  const result = await parser.getText()
  return result.text.trim()
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  return result.value.trim()
}

/**
 * Extracts plain text from an uploaded knowledge file based on its extension.
 * Supports plain text, Markdown, HTML (tags stripped), PDF, and DOCX.
 */
export async function extractFileText(
  buffer: ArrayBuffer | Uint8Array,
  filename: string
): Promise<string> {
  const type = getKnowledgeFileType(filename)
  if (!type) {
    throw new Error(`Unsupported file type: ${filename}`)
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

  switch (type) {
    case 'text':
    case 'markdown':
      return decodeText(bytes)
    case 'html':
      return extractHtmlText(decodeText(bytes))
    case 'pdf':
      return extractPdfText(bytes)
    case 'docx':
      return extractDocxText(bytes)
  }
}
