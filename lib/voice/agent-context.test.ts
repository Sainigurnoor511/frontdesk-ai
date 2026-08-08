import { describe, it, expect } from 'vitest'
import { buildDefaultFirstMessage, buildToneTag } from './agent-context'
import type { AgentDetail } from '@/lib/data/agents'

const baseAgent = {
  business_name: 'Closeloop',
  name: 'Main Receptionist',
} as AgentDetail

describe('buildDefaultFirstMessage', () => {
  it('uses the business name in a short greeting', () => {
    expect(buildDefaultFirstMessage(baseAgent)).toBe(
      'Hello! Thanks for calling Closeloop. How can I help you today?'
    )
  })

  it('falls back to agent name when business name is missing', () => {
    expect(
      buildDefaultFirstMessage({
        ...baseAgent,
        business_name: null,
      })
    ).toBe('Hello! Thanks for calling Main Receptionist. How can I help you today?')
  })
})

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
