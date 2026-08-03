'use server'

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { headers } from 'next/headers'
import { createConversation, updateConversationStatus } from '@/lib/data/conversations-service'
import { checkAndConsumeRateLimit } from '@/lib/voice/rate-limit'
import { startPublicCallSchema, type StartPublicCallInput } from '@/lib/validations/voice'
import { getAvailableSlots } from '@/lib/data/availability-engine'
import { findOrCreateClientServiceRole, createAppointmentServiceRole } from '@/lib/data/booking-service'
import { sendAppointmentConfirmationEmail } from '@/lib/email/send-appointment-confirmation'
import {
  getPublicAvailableSlotsSchema,
  createPublicAppointmentSchema,
  type GetPublicAvailableSlotsInput,
  type CreatePublicAppointmentInput,
} from '@/lib/validations/booking'

const MAX_CALL_SECONDS = 300
const MAX_CALLS_PER_HOUR_PER_IP = 5
const MAX_BOOKINGS_PER_HOUR_PER_IP = 5

export async function startPublicCall(
  input: StartPublicCallInput
): Promise<{ error: string } | { token: string; url: string; roomName: string; conversationId: string }> {
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
  if (process.env.TURNSTILE_SECRET_KEY) {
    if (!parsed.data.turnstileToken) {
      return { error: 'Verification failed. Please refresh and try again.' }
    }

    const verifyForm = new URLSearchParams()
    verifyForm.append('secret', process.env.TURNSTILE_SECRET_KEY)
    verifyForm.append('response', parsed.data.turnstileToken)
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

  const roomName = `${parsed.data.organizationId}:call:${crypto.randomUUID()}`
  const conversation = await createConversation({
    organizationId: parsed.data.organizationId,
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

    // Identity is just an opaque id — no need to embed the (possibly
    // spoofed) IP header value into a string other participants can see.
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: `public-${crypto.randomUUID()}`,
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

export async function getPublicAvailableSlots(
  input: GetPublicAvailableSlotsInput
): Promise<{ error: string } | { slots: { startsAt: string; endsAt: string }[] }> {
  const parsed = getPublicAvailableSlotsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const days = await getAvailableSlots(parsed.data.organizationId, {
    serviceId: parsed.data.serviceId,
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

  if (process.env.TURNSTILE_SECRET_KEY) {
    if (!parsed.data.turnstileToken) {
      return { error: 'Verification failed. Please refresh and try again.' }
    }

    const verifyForm = new URLSearchParams()
    verifyForm.append('secret', process.env.TURNSTILE_SECRET_KEY)
    verifyForm.append('response', parsed.data.turnstileToken)
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
