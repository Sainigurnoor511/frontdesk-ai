'use server'

import { AccessToken } from 'livekit-server-sdk'
import { headers } from 'next/headers'
import {
  createConversation,
  getConversationAssemblyAiSessionId,
  getConversationOwnership,
  setConversationAssemblyAiSessionId,
  updateConversationStatus,
} from '@/lib/data/conversations-service'
import { getAgentByIdServiceRole } from '@/lib/data/agents-service'
import { endLiveKitCallRoom } from '@/lib/voice/end-call'
import { createLiveKitCallRoom } from '@/lib/voice/livekit-room'
import { checkAndConsumeRateLimit } from '@/lib/voice/rate-limit'
import type { StartCallResult } from '@/lib/voice/call-session'
import { startAssemblyAiCall } from '@/lib/voice/providers/assemblyai/start-call'
import { enqueueAssemblyAiFinalize } from '@/lib/voice/providers/assemblyai/enqueue-finalize'
import { runVoiceToolForConversation } from '@/lib/voice/providers/assemblyai/tool-relay'
import {
  startPublicCallSchema,
  endCallSchema,
  endAssemblyAiCallSchema,
  executeVoiceToolSchema,
  linkAssemblyAiSessionSchema,
  type StartPublicCallInput,
  type EndCallInput,
  type EndAssemblyAiCallInput,
  type ExecuteVoiceToolInput,
  type LinkAssemblyAiSessionInput,
} from '@/lib/validations/voice'
import { getAvailableSlots } from '@/lib/data/availability-engine'
import {
  findOrCreateClientServiceRole,
  createAppointmentServiceRole,
  getUpcomingAppointmentsByEmailServiceRole,
  reschedulePublicAppointmentServiceRole,
  cancelPublicAppointmentServiceRole,
} from '@/lib/data/booking-service'
import { sendAppointmentConfirmationEmail } from '@/lib/email/send-appointment-confirmation'
import {
  getPublicAvailableSlotsSchema,
  createPublicAppointmentSchema,
  lookupPublicAppointmentsSchema,
  reschedulePublicAppointmentSchema,
  cancelPublicAppointmentSchema,
  type GetPublicAvailableSlotsInput,
  type CreatePublicAppointmentInput,
  type LookupPublicAppointmentsInput,
  type ReschedulePublicAppointmentInput,
  type CancelPublicAppointmentInput,
} from '@/lib/validations/booking'

const MAX_CALL_SECONDS = 300
const ROOM_EMPTY_TIMEOUT_SECONDS = 30
const ROOM_DEPARTURE_TIMEOUT_SECONDS = 5
const MAX_CALLS_PER_HOUR_PER_IP = 5
const MAX_BOOKINGS_PER_HOUR_PER_IP = 5

export async function startPublicCall(input: StartPublicCallInput): Promise<StartCallResult> {
  const parsed = startPublicCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const headersList = await headers()
  // `x-vercel-forwarded-for` is set by the platform and not client-forgeable.
  // Falling back to `x-forwarded-for`'s leftmost entry is the most
  // attacker-controlled position in that header (an attacker can prepend any
  // value); accepted as a residual risk absent a reverse proxy that
  // normalizes it, but preferring the platform header when present costs
  // nothing and closes the gap on Vercel deployments.
  const ip =
    headersList.get('x-vercel-forwarded-for') ??
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'

  // Turnstile is only enforced when the secret key is configured (e.g.
  // production). Without a configured secret, the widget is never rendered
  // on the public page, so requiring a token here would break local dev.
  // DISABLED for now — see booking-page-public-client.tsx (showTurnstile).
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
  if (false && turnstileSecret) {
    const verifiedSecret = turnstileSecret!
    if (!input.turnstileToken) {
      return { error: 'Verification failed. Please refresh and try again.' }
    }
    const verifiedToken = input.turnstileToken!

    const verifyForm = new URLSearchParams()
    verifyForm.append('secret', verifiedSecret)
    verifyForm.append('response', verifiedToken)
    if (ip && ip !== 'unknown') verifyForm.append('remoteip', ip)

    const verifyResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: verifyForm }
    )

    if (!verifyResponse.ok) {
      return { error: 'Verification failed. Please try again.' }
    }

    const verifyData = (await verifyResponse.json()) as { success?: boolean }
    if (!verifyData.success) {
      return { error: 'Verification failed. Please try again.' }
    }
  }

  const rateLimit = await checkAndConsumeRateLimit(`voice-call:${ip}`, {
    max: MAX_CALLS_PER_HOUR_PER_IP,
    windowSeconds: 3600,
  })

  if (!rateLimit.allowed) {
    return { error: 'Too many calls from this network. Please try again later.' }
  }

  // The org id comes from the public page's URL, so confirm the requested agent
  // actually belongs to it before doing anything with the agent's configuration.
  const agent = await getAgentByIdServiceRole(parsed.data.agentId)
  if (!agent || agent.organization_id !== parsed.data.organizationId) {
    return { error: 'Agent not found.' }
  }

  if (agent.voice_provider === 'assemblyai') {
    return startAssemblyAiCall({ organizationId: parsed.data.organizationId, agent })
  }

  const roomName = `${parsed.data.organizationId}:call:${crypto.randomUUID()}`
  const conversation = await createConversation({
    organizationId: parsed.data.organizationId,
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

    // Identity is just an opaque id — no need to embed the (possibly
    // spoofed) IP header value into a string other participants can see.
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: `public-${crypto.randomUUID()}`,
      ttl: MAX_CALL_SECONDS,
    })
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true })

    return {
      provider: 'livekit',
      token: await at.toJwt(),
      url: process.env.LIVEKIT_URL!,
      roomName,
      conversationId: conversation.id,
    }
  } catch (err) {
    console.error('Failed to create LiveKit room for public call:', err)
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

export async function endPublicCall(
  input: EndCallInput & { organizationId: string }
): Promise<{ error: string } | { success: true }> {
  const parsed = endCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const expectedPrefix = `${input.organizationId}:call:`
  if (!parsed.data.roomName.startsWith(expectedPrefix)) {
    return { error: 'Invalid call room.' }
  }

  await endLiveKitCallRoom(parsed.data.roomName)
  return { success: true }
}

/**
 * Public counterparts of the dashboard's AssemblyAI actions.
 *
 * These run unauthenticated, so `organizationId` comes from the public page's URL
 * rather than a session. Every one of them re-reads the conversation server-side
 * and requires it to belong to that org, which is the same trust model the rest of
 * this file already uses (org scoping by URL, plus IP rate limiting on the
 * expensive entry points).
 */
export async function linkPublicAssemblyAiSession(
  input: LinkAssemblyAiSessionInput & { organizationId: string }
): Promise<{ error: string } | { success: true }> {
  const parsed = linkAssemblyAiSessionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const linked = await setConversationAssemblyAiSessionId(
    parsed.data.conversationId,
    parsed.data.sessionId,
    input.organizationId
  )

  if (!linked) {
    return { error: 'Could not link the call session.' }
  }

  return { success: true }
}

export async function executePublicVoiceTool(
  input: ExecuteVoiceToolInput & { organizationId: string }
): Promise<{ result: unknown }> {
  const parsed = executeVoiceToolSchema.safeParse(input)
  if (!parsed.success) {
    return { result: { error: 'invalid_request' } }
  }

  const result = await runVoiceToolForConversation({
    conversationId: parsed.data.conversationId,
    organizationId: input.organizationId,
    toolName: parsed.data.toolName,
    arguments: parsed.data.arguments,
  })

  return { result }
}

export async function endPublicAssemblyAiCall(
  input: EndAssemblyAiCallInput & { organizationId: string }
): Promise<{ error: string } | { success: true }> {
  const parsed = endAssemblyAiCallSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const conversation = await getConversationOwnership(parsed.data.conversationId)
  if (!conversation || conversation.organizationId !== input.organizationId) {
    return { error: 'Conversation not found.' }
  }

  // Leaves the conversation `active` on purpose so the queued job can perform the
  // terminal write with the transcript attached — see `endAssemblyAiCall`.
  const sessionId = await getConversationAssemblyAiSessionId(parsed.data.conversationId)
  if (!sessionId) {
    try {
      await updateConversationStatus(parsed.data.conversationId, {
        status: 'failed',
        outcome: 'failed',
        endedReason: 'assemblyai_session_never_started',
      })
    } catch (err) {
      console.error(`Failed to mark conversation ${parsed.data.conversationId} as failed:`, err)
    }
    return { success: true }
  }

  await enqueueAssemblyAiFinalize({ conversationId: parsed.data.conversationId, sessionId })
  return { success: true }
}

export async function getPublicAvailableSlots(
  input: GetPublicAvailableSlotsInput
): Promise<{ error: string } | { slots: { startsAt: string; endsAt: string }[] }> {
  const parsed = getPublicAvailableSlotsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const days = await getAvailableSlots(parsed.data.organizationId, {
    serviceId: parsed.data.serviceId ?? '',
    staffId: parsed.data.staffId ?? null,
    rangeStart: parsed.data.date,
    rangeEnd: parsed.data.date,
  })

  return { slots: days[0]?.slots ?? [] }
}

export async function createPublicAppointment(
  input: CreatePublicAppointmentInput
): Promise<{ error: string } | { success: true; appointmentId: string }> {
  const parsed = createPublicAppointmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const headersList = await headers()
  const ip =
    headersList.get('x-vercel-forwarded-for') ??
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
  // DISABLED for now — see booking-page-public-client.tsx (showTurnstile).
  if (false && turnstileSecret) {
    const verifiedSecret = turnstileSecret!
    if (!input.turnstileToken) {
      return { error: 'Verification failed. Please refresh and try again.' }
    }
    const verifiedToken = input.turnstileToken!

    const verifyForm = new URLSearchParams()
    verifyForm.append('secret', verifiedSecret)
    verifyForm.append('response', verifiedToken)
    if (ip && ip !== 'unknown') verifyForm.append('remoteip', ip)

    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyForm,
    })

    if (!verifyResponse.ok) {
      return { error: 'Verification failed. Please try again.' }
    }

    const verifyData = (await verifyResponse.json()) as { success?: boolean }
    if (!verifyData.success) {
      return { error: 'Verification failed. Please try again.' }
    }
  }

  const rateLimit = await checkAndConsumeRateLimit(`booking:${ip}`, {
    max: MAX_BOOKINGS_PER_HOUR_PER_IP,
    windowSeconds: 3600,
  })

  if (!rateLimit.allowed) {
    return { error: 'Too many booking attempts from this network. Please try again later.' }
  }

  const date = parsed.data.startsAt.slice(0, 10)
  const days = await getAvailableSlots(parsed.data.organizationId, {
    serviceId: parsed.data.serviceId,
    staffId: parsed.data.staffId ?? null,
    rangeStart: date,
    rangeEnd: date,
  })
  const stillOpen = (days[0]?.slots ?? []).some(
    (slot) => slot.startsAt === parsed.data.startsAt && slot.endsAt === parsed.data.endsAt
  )
  if (!stillOpen) {
    return { error: 'slot_taken' }
  }

  const clientPhone = parsed.data.clientPhone?.trim() || null
  const client = await findOrCreateClientServiceRole(parsed.data.organizationId, {
    name: parsed.data.clientName,
    phoneNumber: clientPhone,
    email: parsed.data.clientEmail,
  })

  const appointment = await createAppointmentServiceRole(parsed.data.organizationId, null, null, {
    title: 'Online booking',
    clientName: parsed.data.clientName,
    clientPhone,
    clientId: client.id,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    serviceId: parsed.data.serviceId,
    staffId: parsed.data.staffId ?? null,
    notes: parsed.data.notes ?? null,
  })

  try {
    await sendAppointmentConfirmationEmail({
      to: parsed.data.clientEmail,
      clientName: parsed.data.clientName,
      businessName: parsed.data.businessName ?? 'Our office',
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
    })
  } catch (emailError) {
    console.error(`[book/actions] confirmation email failed for appointment ${appointment.id}:`, emailError)
  }

  return { success: true, appointmentId: appointment.id }
}

export type PublicAppointmentSummary = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  serviceId: string | null
}

export async function lookupPublicAppointments(
  input: LookupPublicAppointmentsInput
): Promise<{ error: string } | { appointments: PublicAppointmentSummary[] }> {
  const parsed = lookupPublicAppointmentsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const rows = await getUpcomingAppointmentsByEmailServiceRole(parsed.data.organizationId, parsed.data.email)

  return {
    appointments: rows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      serviceId: row.service_id,
    })),
  }
}

export async function reschedulePublicAppointment(
  input: ReschedulePublicAppointmentInput
): Promise<{ error: string } | { success: true }> {
  const parsed = reschedulePublicAppointmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Re-check the new slot is still open before moving the appointment onto
  // it — no serviceId is known here, so this checks the org-wide gap the
  // same way the voice-booking tool does (see lib/voice/booking-tools.ts).
  const date = parsed.data.startsAt.slice(0, 10)
  const days = await getAvailableSlots(parsed.data.organizationId, {
    serviceId: '',
    rangeStart: date,
    rangeEnd: date,
  })
  const stillOpen = (days[0]?.slots ?? []).some(
    (slot) => slot.startsAt === parsed.data.startsAt && slot.endsAt === parsed.data.endsAt
  )
  if (!stillOpen) {
    return { error: 'slot_taken' }
  }

  return reschedulePublicAppointmentServiceRole(
    parsed.data.organizationId,
    parsed.data.appointmentId,
    parsed.data.email,
    parsed.data.startsAt,
    parsed.data.endsAt
  )
}

export async function cancelPublicAppointment(
  input: CancelPublicAppointmentInput
): Promise<{ error: string } | { success: true }> {
  const parsed = cancelPublicAppointmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  return cancelPublicAppointmentServiceRole(
    parsed.data.organizationId,
    parsed.data.appointmentId,
    parsed.data.email
  )
}
