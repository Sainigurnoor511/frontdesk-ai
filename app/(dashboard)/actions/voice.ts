'use server'

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { createClient } from '@/lib/supabase/server'
import { createConversation, updateConversationStatus } from '@/lib/data/conversations-service'
import { startDashboardCallSchema, type StartDashboardCallInput } from '@/lib/validations/voice'

const MAX_CALL_SECONDS = 300

export async function startDashboardCall(
  input: StartDashboardCallInput
): Promise<{ error: string } | { token: string; url: string; roomName: string; conversationId: string }> {
  const parsed = startDashboardCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to start a call.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const roomName = `${member.organization_id}:call:${crypto.randomUUID()}`
  const conversation = await createConversation({
    organizationId: member.organization_id,
    agentId: parsed.data.agentId,
    channel: 'voice_web',
    status: 'active',
  })

  try {
    // Explicitly pre-create the room with metadata so the voice worker
    // (workers/voice-agent.ts) can read { agentId, conversationId } off
    // `ctx.room.metadata` instead of parsing them out of the room name.
    const roomService = new RoomServiceClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    )
    await roomService.createRoom({
      name: roomName,
      metadata: JSON.stringify({ agentId: parsed.data.agentId, conversationId: conversation.id }),
      emptyTimeout: MAX_CALL_SECONDS,
      departureTimeout: 30,
    })

    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: `dashboard-${user.id}`,
      ttl: MAX_CALL_SECONDS,
    })
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true })

    return {
      token: await at.toJwt(),
      url: process.env.LIVEKIT_URL!,
      roomName,
      conversationId: conversation.id,
    }
  } catch (err) {
    await updateConversationStatus(conversation.id, {
      status: 'failed',
      outcome: 'failed',
      endedReason: 'room_creation_failed',
    })
    console.error('Failed to create LiveKit room for dashboard call:', err)
    return { error: 'Could not start the call. Please try again.' }
  }
}
