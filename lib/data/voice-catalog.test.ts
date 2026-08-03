import { describe, it, expect } from 'vitest'
import { defaultVoiceIdForLanguage } from './voice-catalog'

const ENGLISH_VOICE_ID = '76b55591c758444cb95253708696dfad'

describe('defaultVoiceIdForLanguage', () => {
  it('resolves the first English voice when no language is set', () => {
    expect(defaultVoiceIdForLanguage(null)).toBe(ENGLISH_VOICE_ID)
  })

  it('resolves a voice for a known language code', () => {
    expect(defaultVoiceIdForLanguage('hi')).toBe('4d7609058bd34213b1378b29efbde1f1')
  })

  it('normalizes legacy language labels', () => {
    expect(defaultVoiceIdForLanguage('English')).toBe(ENGLISH_VOICE_ID)
  })

  it('falls back to English for an unsupported language', () => {
    expect(defaultVoiceIdForLanguage('sw')).toBe(ENGLISH_VOICE_ID)
  })
})
