export const dynamic = 'force-dynamic'

/**
 * Exposes the LiveKit endpoint URL so the client can prewarm its connection
 * (DNS/TLS/edge selection) before the caller taps "start". The URL is not a
 * secret — joining a room still requires a minted token.
 */
export async function GET(): Promise<Response> {
  return Response.json({ url: process.env.LIVEKIT_URL ?? null })
}
