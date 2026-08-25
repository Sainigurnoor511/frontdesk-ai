export type VoiceRoomMetadata = {
  agentId: string
  conversationId: string
}

export function parseVoiceRoomMetadata(raw: string | undefined): VoiceRoomMetadata | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as VoiceRoomMetadata).agentId === 'string' &&
      typeof (parsed as VoiceRoomMetadata).conversationId === 'string'
    ) {
      return parsed as VoiceRoomMetadata
    }
    return null
  } catch {
    return null
  }
}
