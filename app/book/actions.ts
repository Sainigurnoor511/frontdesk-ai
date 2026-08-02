'use server'

import { AccessToken } from 'livekit-server-sdk'
import { headers } from 'next/headers'
import { createConversation } from '@/lib/data/conversations-service'
import { checkAndConsumeRateLimit } from '@/lib/voice/rate-limit'
import { startPublicCallSchema, type StartPublicCallInput } from '@/lib/validations/voice'

const MAX_CALL_SECONDS = 300
const MAX_CALLS_PER_HOUR_PER_IP = 5

export async function startPublicCall(
  input: StartPublicCallInput
): Promise<{ error: string } | { token: string; url: string; roomName: string; conversationId: string }> {
  const parsed = startPublicCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'

  const rateLimit = await checkAndConsumeRateLimit(`voice-call:${ip}`, {
    max: MAX_CALLS_PER_HOUR_PER_IP,
    windowSeconds: 3600,
  })

  if (!rateLimit.allowed) {
    return { error: 'Too many calls from this network. Please try again later.' }
  }

  const roomName = `${parsed.data.organizationId}:call:${crypto.randomUUID()}`
  const conversation = await createConversation({
    organizationId: parsed.data.organizationId,
    agentId: parsed.data.agentId,
    channel: 'voice_web',
    status: 'active',
  })

  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: `public-${ip}-${crypto.randomUUID()}`,
    ttl: MAX_CALL_SECONDS,
  })
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true })

  return {
    token: await at.toJwt(),
    url: process.env.LIVEKIT_URL!,
    roomName,
    conversationId: conversation.id,
  }
}
