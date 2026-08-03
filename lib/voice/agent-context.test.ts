import { describe, it, expect } from 'vitest'
import { buildToneTag } from './agent-context'

describe('buildToneTag', () => {
  it('returns null when there are no traits', () => {
    expect(buildToneTag([])).toBeNull()
  })

  it('joins traits lowercased into a bracket tag', () => {
    expect(buildToneTag(['Friendly', 'Warm'])).toBe('[friendly, warm]')
  })

  it('ignores empty or whitespace-only traits', () => {
    expect(buildToneTag(['  ', 'Direct'])).toBe('[direct]')
  })

  it('dedupes nothing but keeps the configured order', () => {
    expect(buildToneTag(['Professional', 'Concise'])).toBe('[professional, concise]')
  })
})
