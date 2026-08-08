import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const CAL_COM_SLUG = 'cal-com'
const CAL_COM_API_VERSION = '2026-02-25'

type CalComConfig = {
  apiKey: string
  eventTypeId: number
  timezone: string
}

type AppointmentForCalCom = {
  id: string
  startsAt: string
  timezone: string
  clientName: string | null
  clientEmail: string | null
  clientPhone: string | null
  calComBookingUid: string | null
}

function parseConfig(config: unknown): CalComConfig | null {
  if (!config || typeof config !== 'object') return null
  const record = config as Record<string, unknown>
  if (typeof record.apiKey !== 'string') return null
  if (typeof record.eventTypeId !== 'number') return null
  return {
    apiKey: record.apiKey,
    eventTypeId: record.eventTypeId,
    timezone: typeof record.timezone === 'string' ? record.timezone : 'UTC',
  }
}

async function getConfig(organizationId: string): Promise<CalComConfig | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organization_integrations')
    .select('is_enabled, config')
    .eq('organization_id', organizationId)
    .eq('integration_slug', CAL_COM_SLUG)
    .maybeSingle()

  if (!data || !data.is_enabled) return null
  return parseConfig(data.config)
}

async function calComRequest<T>(
  apiKey: string,
  path: string,
  method: 'POST',
  body: unknown
): Promise<T | null> {
  const response = await fetch(`https://api.cal.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'cal-api-version': CAL_COM_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cal.com ${path} failed with ${response.status}: ${text}`)
  }

  return (await response.json()) as T
}

async function getAppointmentForSync(
  organizationId: string,
  appointmentId: string
): Promise<AppointmentForCalCom | null> {
  const supabase = createServiceRoleClient()
  const [{ data: appointment }, { data: profile }] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, starts_at, client_name, client_phone, client_id, cal_com_booking_uid')
      .eq('id', appointmentId)
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('business_profile')
      .select('timezone')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ])

  if (!appointment) return null

  let clientEmail: string | null = null
  if (appointment.client_id) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('email')
      .eq('id', appointment.client_id)
      .maybeSingle()
    clientEmail = clientRow?.email ?? null
  }

  return {
    id: appointment.id,
    startsAt: appointment.starts_at,
    timezone: profile?.timezone ?? 'UTC',
    clientName: appointment.client_name ?? null,
    clientEmail,
    clientPhone: appointment.client_phone ?? null,
    calComBookingUid: appointment.cal_com_booking_uid ?? null,
  }
}

async function saveBookingUid(organizationId: string, appointmentId: string, uid: string): Promise<void> {
  const supabase = createServiceRoleClient()
  await supabase
    .from('appointments')
    .update({ cal_com_booking_uid: uid })
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)
}

export async function handleCalComAppointmentCreated(
  organizationId: string,
  appointmentId: string
): Promise<void> {
  try {
    const [config, appointment] = await Promise.all([
      getConfig(organizationId),
      getAppointmentForSync(organizationId, appointmentId),
    ])
    if (!config || !appointment) return
    if (!appointment.clientEmail) return

    const payload = {
      start: appointment.startsAt,
      eventTypeId: config.eventTypeId,
      attendee: {
        name: appointment.clientName ?? 'Client',
        email: appointment.clientEmail,
        timeZone: config.timezone || appointment.timezone,
        ...(appointment.clientPhone ? { phoneNumber: appointment.clientPhone } : {}),
      },
      metadata: {
        frontdeskAppointmentId: appointment.id,
      },
    }

    const result = await calComRequest<{ data?: { uid?: string } }>(
      config.apiKey,
      '/v2/bookings',
      'POST',
      payload
    )

    const uid = result?.data?.uid
    if (uid) {
      await saveBookingUid(organizationId, appointmentId, uid)
    }
  } catch (error) {
    console.error('[cal-com] create sync failed:', error)
  }
}

export async function handleCalComAppointmentUpdated(
  organizationId: string,
  appointmentId: string
): Promise<void> {
  try {
    const [config, appointment] = await Promise.all([
      getConfig(organizationId),
      getAppointmentForSync(organizationId, appointmentId),
    ])
    if (!config || !appointment?.calComBookingUid) return

    await calComRequest(
      config.apiKey,
      `/v2/bookings/${appointment.calComBookingUid}/reschedule`,
      'POST',
      { start: appointment.startsAt }
    )
  } catch (error) {
    console.error('[cal-com] update sync failed:', error)
  }
}

export async function handleCalComAppointmentCancelled(
  organizationId: string,
  appointmentId: string
): Promise<void> {
  try {
    const [config, appointment] = await Promise.all([
      getConfig(organizationId),
      getAppointmentForSync(organizationId, appointmentId),
    ])
    if (!config || !appointment?.calComBookingUid) return

    await calComRequest(
      config.apiKey,
      `/v2/bookings/${appointment.calComBookingUid}/cancel`,
      'POST',
      { cancellationReason: 'Cancelled in Frontdesk.ai' }
    )
  } catch (error) {
    console.error('[cal-com] cancel sync failed:', error)
  }
}
