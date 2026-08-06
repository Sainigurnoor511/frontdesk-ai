import { describe, it, expect } from 'vitest'
import { chunkText } from './chunk-text'

describe('chunkText', () => {
  it('returns empty array for blank input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n\n  ')).toEqual([])
  })

  it('keeps short text as a single chunk', () => {
    expect(chunkText('Hello world')).toEqual(['Hello world'])
  })

  it('splits long text into multiple chunks', () => {
    const paragraph = 'A'.repeat(800)
    const chunks = chunkText(`${paragraph}\n\n${paragraph}`, 500)
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(500))
  })
})
