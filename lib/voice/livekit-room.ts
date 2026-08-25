import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk'
import { RoomAgentDispatch } from '@livekit/protocol'

export type CreateLiveKitCallRoomOptions = {
  roomName: string
  agentId: string
  conversationId: string
  emptyTimeout?: number
  departureTimeout?: number
}

/** Matches the unnamed worker registered by `workers/voice-agent.ts`. */
const VOICE_AGENT_DISPATCH_NAME = ''

function getLiveKitCredentials() {
  const url = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!url || !apiKey || !apiSecret) return null
  return { url, apiKey, apiSecret }
}

/** Pre-creates a call room, sets metadata, and dispatches the voice agent immediately. */
export async function createLiveKitCallRoom({
  roomName,
  agentId,
  conversationId,
  emptyTimeout,
  departureTimeout,
}: CreateLiveKitCallRoomOptions): Promise<void> {
  const credentials = getLiveKitCredentials()
  if (!credentials) {
    throw new Error('LiveKit is not configured.')
  }

  const { url, apiKey, apiSecret } = credentials
  const roomService = new RoomServiceClient(url, apiKey, apiSecret)
  const dispatchClient = new AgentDispatchClient(url, apiKey, apiSecret)
  const metadata = JSON.stringify({ agentId, conversationId })

  try {
    await roomService.createRoom({
      name: roomName,
      metadata,
      emptyTimeout,
      departureTimeout,
      // Dispatch the voice worker as soon as the room exists — before the user joins.
      agents: [new RoomAgentDispatch({ agentName: VOICE_AGENT_DISPATCH_NAME, metadata })],
    })
  } catch {
    // Room may already exist from a prior attempt — metadata/dispatch are set below.
  }

  await Promise.all([
    roomService.updateRoomMetadata(roomName, metadata),
    dispatchClient
      .createDispatch(roomName, VOICE_AGENT_DISPATCH_NAME, { metadata })
      .catch((err) => {
        console.warn(`[livekit-room] agent dispatch for ${roomName} (may already exist):`, err)
      }),
  ])
}
