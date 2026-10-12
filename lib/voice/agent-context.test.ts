import { describe, it, expect } from 'vitest'
import { buildDefaultFirstMessage, buildSystemPrompt, buildToneTag } from './agent-context'
import type { AgentDetail } from '@/lib/data/agents'

const baseAgent = {
  business_name: 'Closeloop',
  name: 'Main Receptionist',
} as AgentDetail

const promptAgent = {
  ...baseAgent,
  tone_traits: [],
  secure_mode: false,
  identity_verification_enabled: false,
  allow_dtmf: false,
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

describe('buildSystemPrompt', () => {
  it('tells an unrestricted agent it can look up, move, and cancel appointments', () => {
    const prompt = buildSystemPrompt(promptAgent)

    expect(prompt).toContain('look up, move, and cancel appointments that are already booked')
  })

  it('says nothing about secure mode when the agent is not in it', () => {
    expect(buildSystemPrompt(promptAgent).toLowerCase()).not.toContain('secure mode')
  })

  it('tells a secure-mode agent the appointment tools are withheld, not permitted', () => {
    const prompt = buildSystemPrompt({ ...promptAgent, secure_mode: true } as AgentDetail)

    expect(prompt).toContain('Secure mode is enabled')
    expect(prompt).toContain('You cannot look up, move, or cancel appointments')
    // The prompt must not contradict `manageBookingToolsAllowed()`, which has
    // already removed those tools from the list by the time this is read.
    expect(prompt).not.toContain('You can also look up, move, and cancel appointments')
    expect(prompt).not.toContain('Neither secure mode nor identity verification restricts')
  })

  it('withholds them for identity verification alone, which is an independent toggle', () => {
    const prompt = buildSystemPrompt({
      ...promptAgent,
      identity_verification_enabled: true,
    } as AgentDetail)

    expect(prompt).toContain('Identity verification is available')
    expect(prompt).toContain('You cannot look up, move, or cancel appointments')
    expect(prompt).not.toContain('Do not ask for a one-time code before using them.')
  })

  it('still describes booking itself, which neither flag restricts', () => {
    const prompt = buildSystemPrompt({ ...promptAgent, secure_mode: true } as AgentDetail)

    expect(prompt).toContain('tools to check appointment availability and book appointments')
  })
})
