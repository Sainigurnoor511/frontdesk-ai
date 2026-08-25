'use server'

import { AccessToken } from 'livekit-server-sdk'
import { createClient } from '@/lib/supabase/server'
import { createConversation, updateConversationStatus } from '@/lib/data/conversations-service'
import { endLiveKitCallRoom } from '@/lib/voice/end-call'
import { createLiveKitCallRoom } from '@/lib/voice/livekit-room'
import { startDashboardCallSchema, endCallSchema, type StartDashboardCallInput, type EndCallInput } from '@/lib/validations/voice'

const MAX_CALL_SECONDS = 300
/** Seconds before an empty room is auto-deleted by LiveKit (safety net). */
const ROOM_EMPTY_TIMEOUT_SECONDS = 30
/** Seconds after the last participant leaves before the room is considered empty. */
const ROOM_DEPARTURE_TIMEOUT_SECONDS = 5

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
    roomName,
  })

  try {
    await createLiveKitCallRoom({
      roomName,
      agentId: parsed.data.agentId,
      conversationId: conversation.id,
      emptyTimeout: ROOM_EMPTY_TIMEOUT_SECONDS,
      departureTimeout: ROOM_DEPARTURE_TIMEOUT_SECONDS,
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
    console.error('Failed to create LiveKit room for dashboard call:', err)
    try {
      await updateConversationStatus(conversation.id, {
        status: 'failed',
        outcome: 'failed',
        endedReason: 'room_creation_failed',
      })
    } catch (updateErr) {
      console.error(`Failed to mark conversation ${conversation.id} as failed:`, updateErr)
    }
    return { error: 'Could not start the call. Please try again.' }
  }
}

export async function endDashboardCall(
  input: EndCallInput
): Promise<{ error: string } | { success: true }> {
  const parsed = endCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to end a call.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const expectedPrefix = `${member.organization_id}:call:`
  if (!parsed.data.roomName.startsWith(expectedPrefix)) {
    return { error: 'Invalid call room.' }
  }

  await endLiveKitCallRoom(parsed.data.roomName)
  return { success: true }
}
