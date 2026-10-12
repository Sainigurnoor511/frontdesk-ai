import { describe, it, expect } from 'vitest'
import { buildAssemblyAiSessionConfig } from './session-config'
import type { AgentDetail } from '@/lib/data/agents'

const agent = {
  id: 'agent-1',
  name: 'Main Receptionist',
  business_name: 'Closeloop',
  industry: 'Dental',
  language: 'English',
  detect_language: false,
  first_message: 'Hi there.',
  tone_traits: [],
  voice_id: null,
  filter_background_speech: false,
  secure_mode: false,
  identity_verification_enabled: false,
  allow_dtmf: false,
} as unknown as AgentDetail

function buildInput(filterBackgroundSpeech: boolean) {
  return buildAssemblyAiSessionConfig({
    agent: { ...agent, filter_background_speech: filterBackgroundSpeech },
    rules: [],
    tools: [],
  }).input
}

describe('buildAssemblyAiSessionConfig', () => {
  it('turns filter_background_speech into voice focus on the session', () => {
    const input = buildInput(true)

    expect(input.voice_focus).toBe('near-field')
    expect(input.voice_focus_threshold).toBe(0.95)
  })

  it('omits voice focus entirely when the setting is off', () => {
    const input = buildInput(false)

    expect(input.voice_focus).toBeUndefined()
    // The threshold is rejected by the API unless `voice_focus` accompanies it,
    // so neither field may be sent on its own.
    expect(input.voice_focus_threshold).toBeUndefined()
  })
})
