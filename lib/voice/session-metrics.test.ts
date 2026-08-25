import { describe, expect, it } from 'vitest'
import { buildGreetingCacheKey } from './say-cached'

describe('buildGreetingCacheKey', () => {
  it('includes voice id and tone tag in the cache key', () => {
    expect(buildGreetingCacheKey('voice-1', '[friendly]', 'Hello')).toBe(
      'voice-1|[friendly]|Hello'
    )
    expect(buildGreetingCacheKey('voice-1', null, 'Hello')).toBe('voice-1||Hello')
  })
})
