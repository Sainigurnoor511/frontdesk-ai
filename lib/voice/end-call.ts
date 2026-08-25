import { EgressClient, EgressStatus, RoomServiceClient } from 'livekit-server-sdk'

const ACTIVE_EGRESS_STATUSES = new Set([
  EgressStatus.EGRESS_STARTING,
  EgressStatus.EGRESS_ACTIVE,
  EgressStatus.EGRESS_ENDING,
])

function liveKitClients() {
  const url = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!url || !apiKey || !apiSecret) return null
  return {
    egress: new EgressClient(url, apiKey, apiSecret),
    rooms: new RoomServiceClient(url, apiKey, apiSecret),
  }
}

/**
 * Immediately tears down a LiveKit call room: stops active egress sessions, then
 * deletes the room so all participants (including the voice agent) disconnect.
 */
export async function endLiveKitCallRoom(roomName: string): Promise<void> {
  const clients = liveKitClients()
  if (!clients) return

  try {
    const egresses = await clients.egress.listEgress({ roomName })
    await Promise.all(
      egresses
        .filter((egress) => egress.egressId && ACTIVE_EGRESS_STATUSES.has(egress.status))
        .map(async (egress) => {
          try {
            await clients.egress.stopEgress(egress.egressId!)
          } catch (err) {
            console.warn(`[voice] stopEgress ${egress.egressId} for ${roomName}:`, err)
          }
        })
    )
  } catch (err) {
    console.error(`[voice] failed to list/stop egress for room ${roomName}:`, err)
  }

  try {
    await clients.rooms.deleteRoom(roomName)
  } catch (err) {
    console.warn(`[voice] deleteRoom ${roomName}:`, err)
  }
}
