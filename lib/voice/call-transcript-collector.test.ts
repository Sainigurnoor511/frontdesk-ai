import { describe, expect, it } from 'vitest'
import { buildTranscriptMessage, mapChatRoleToTranscriptRole } from './call-transcript-collector'

describe('mapChatRoleToTranscriptRole', () => {
  it('maps user and assistant roles', () => {
    expect(mapChatRoleToTranscriptRole('user')).toBe('caller')
    expect(mapChatRoleToTranscriptRole('assistant')).toBe('agent')
  })

  it('ignores system and developer roles', () => {
    expect(mapChatRoleToTranscriptRole('system')).toBeNull()
    expect(mapChatRoleToTranscriptRole('developer')).toBeNull()
  })
})

describe('buildTranscriptMessage', () => {
  it('computes timestampSeconds relative to call start', () => {
    const message = buildTranscriptMessage('caller', 'Hello', 12_500, 10_000)
    expect(message).toEqual({
      role: 'caller',
      text: 'Hello',
      timestampSeconds: 3,
    })
  })

  it('never returns negative timestamps', () => {
    const message = buildTranscriptMessage('agent', 'Hi', 5_000, 10_000)
    expect(message.timestampSeconds).toBe(0)
  })
})
