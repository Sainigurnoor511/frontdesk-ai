import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { getKnowledgeFileType, extractFileText } from './extract-file-text'

describe('getKnowledgeFileType', () => {
  it('maps supported extensions to types, case-insensitively', () => {
    expect(getKnowledgeFileType('notes.txt')).toBe('text')
    expect(getKnowledgeFileType('README.md')).toBe('markdown')
    expect(getKnowledgeFileType('guide.MARKDOWN')).toBe('markdown')
    expect(getKnowledgeFileType('page.html')).toBe('html')
    expect(getKnowledgeFileType('page.HTM')).toBe('html')
    expect(getKnowledgeFileType('spec.pdf')).toBe('pdf')
    expect(getKnowledgeFileType('report.docx')).toBe('docx')
  })

  it('returns null for unsupported extensions', () => {
    expect(getKnowledgeFileType('archive.zip')).toBeNull()
    expect(getKnowledgeFileType('no-extension')).toBeNull()
  })
})

describe('extractFileText', () => {
  it('decodes plain text files', async () => {
    const text = await extractFileText(
      Buffer.from('Hello plain text'),
      'notes.txt'
    )
    expect(text).toBe('Hello plain text')
  })

  it('decodes markdown files verbatim', async () => {
    const md = '# Heading\n\nSome *body* text.'
    const text = await extractFileText(Buffer.from(md), 'readme.md')
    expect(text).toBe(md)
  })

  it('strips markup from html files', async () => {
    const html = `<!doctype html>
      <html><head><title>Ignored</title>
      <script>alert('nope')</script><style>p{color:red}</style></head>
      <body><p>Hello <b>world</b></p></body></html>`
    const text = await extractFileText(Buffer.from(html), 'page.html')
    expect(text).toBe('Hello world')
    expect(text).not.toContain('<')
    expect(text).not.toContain('script')
    expect(text).not.toContain('alert')
  })

  it('extracts text from pdf files', async () => {
    const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 100 700 Td (Hello PDF) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R /Size 6 >>
%%EOF`
    const text = await extractFileText(Buffer.from(pdf, 'ascii'), 'spec.pdf')
    expect(text).toContain('Hello PDF')
  })

  it('extracts text from docx files', async () => {
    const zip = new JSZip()
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    )
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    )
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Hello Docx</w:t></w:r></w:p></w:body>
</w:document>`
    )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const text = await extractFileText(buffer, 'report.docx')
    expect(text).toContain('Hello Docx')
  })

  it('rejects unsupported file types', async () => {
    await expect(extractFileText(Buffer.from('data'), 'archive.zip')).rejects.toThrow(
      /Unsupported file type/
    )
  })
})
