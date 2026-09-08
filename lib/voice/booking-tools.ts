import { buildBookingToolHandlers } from './tools/booking-handlers'
import { toLiveKitTools } from './livekit-tool-adapter'

/**
 * LiveKit adapter for the booking tools.
 *
 * The behavior lives in `tools/booking-handlers.ts` so the AssemblyAI Voice Agent
 * provider runs the exact same code; this file only wraps each handler for
 * `AgentSession` and keys them by name.
 *
 * Note this is NOT the local text-assistant wrapper in `lib/assistant/tools.ts`,
 * which targets the dashboard chat assistant's HTTP tool-calling loop and has a
 * different signature.
 */
export function buildBookingTools(context: {
  organizationId: string
  agentId: string
  conversationId: string
}) {
  return toLiveKitTools(buildBookingToolHandlers(context))
}
