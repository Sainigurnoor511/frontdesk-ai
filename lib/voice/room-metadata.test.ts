import { describe, expect, it } from 'vitest'
import { parseVoiceRoomMetadata } from './room-metadata'

describe('parseVoiceRoomMetadata', () => {
  it('returns null for empty input', () => {
    expect(parseVoiceRoomMetadata(undefined)).toBeNull()
    expect(parseVoiceRoomMetadata('')).toBeNull()
  })

  it('parses valid metadata', () => {
    expect(
      parseVoiceRoomMetadata(
        JSON.stringify({ agentId: 'agent-1', conversationId: 'conv-1' })
      )
    ).toEqual({ agentId: 'agent-1', conversationId: 'conv-1' })
  })

  it('rejects invalid payloads', () => {
    expect(parseVoiceRoomMetadata('not-json')).toBeNull()
    expect(parseVoiceRoomMetadata(JSON.stringify({ agentId: 'only' }))).toBeNull()
  })
})
