import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  deleteMicrosoftCalendarEventForOrg,
  getMicrosoftCalendarConnectionStatus,
  upsertMicrosoftCalendarEventForOrg,
} from '@/lib/integrations/microsoft-calendar'

type AppointmentForSync = {
  id: string
  title: string
  notes: string | null
  startsAt: string
  endsAt: string
  timezone: string
  clientName: string | null
  clientEmail: string | null
  clientPhone: string | null
  serviceName: string | null
  serviceDurationMinutes: number | null
  staffName: string | null
  microsoftCalendarEventId: string | null
}

function buildSubject(appointment: AppointmentForSync) {
  const service = appointment.serviceName?.trim() || appointment.title || 'Appointment'
  const client = appointment.clientName?.trim()
  return client ? `${service} with ${client}` : service
}

function buildBody(appointment: AppointmentForSync) {
  const lines: string[] = []
  if (appointment.serviceName) lines.push(`Service: ${appointment.serviceName}`)
  if (appointment.serviceDurationMinutes) {
    lines.push(`Duration: ${appointment.serviceDurationMinutes} minutes`)
  }
  if (appointment.staffName) lines.push(`Staff: ${appointment.staffName}`)
  if (appointment.clientName) lines.push(`Client: ${appointment.clientName}`)
  if (appointment.clientEmail) lines.push(`Email: ${appointment.clientEmail}`)
  if (appointment.clientPhone) lines.push(`Phone: ${appointment.clientPhone}`)
  if (appointment.notes?.trim()) {
    lines.push('')
    lines.push(appointment.notes.trim())
  }
  lines.push('')
  lines.push(`Appointment ID: ${appointment.id}`)
  return lines.join('\n')
}

async function fetchAppointmentForSync(
  organizationId: string,
  appointmentId: string
): Promise<AppointmentForSync | null> {
  const supabase = createServiceRoleClient()
  const [{ data: appointment }, { data: profile }] = await Promise.all([
    supabase
      .from('appointments')
      .select(
        `
        id,
        title,
        notes,
        starts_at,
        ends_at,
        client_name,
        client_phone,
        client_id,
        service_id,
        staff_id,
        microsoft_calendar_event_id
      `
      )
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

  const [clientResult, serviceResult, staffResult] = await Promise.all([
    appointment.client_id
      ? supabase
          .from('clients')
          .select('name, email, phone_number')
          .eq('id', appointment.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    appointment.service_id
      ? supabase
          .from('services')
          .select('name, duration_minutes')
          .eq('id', appointment.service_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    appointment.staff_id
      ? supabase
          .from('staff_members')
          .select('display_name, full_name')
          .eq('id', appointment.staff_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    id: appointment.id,
    title: appointment.title,
    notes: appointment.notes,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    timezone: profile?.timezone ?? 'UTC',
    clientName: appointment.client_name ?? clientResult.data?.name ?? null,
    clientEmail: clientResult.data?.email ?? null,
    clientPhone: appointment.client_phone ?? clientResult.data?.phone_number ?? null,
    serviceName: serviceResult.data?.name ?? null,
    serviceDurationMinutes: serviceResult.data?.duration_minutes ?? null,
    staffName: staffResult.data?.display_name ?? staffResult.data?.full_name ?? null,
    microsoftCalendarEventId: appointment.microsoft_calendar_event_id ?? null,
  }
}

async function persistEventId(organizationId: string, appointmentId: string, eventId: string | null) {
  if (!eventId) return
  const supabase = createServiceRoleClient()
  await supabase
    .from('appointments')
    .update({ microsoft_calendar_event_id: eventId })
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)
}

export async function handleMicrosoftAppointmentCreated(
  organizationId: string,
  appointmentId: string
): Promise<void> {
  try {
    const status = await getMicrosoftCalendarConnectionStatus(organizationId)
    if (!status.isConnected) return

    const appointment = await fetchAppointmentForSync(organizationId, appointmentId)
    if (!appointment) return

    const eventId = await upsertMicrosoftCalendarEventForOrg(
      organizationId,
      {
        subject: buildSubject(appointment),
        body: { contentType: 'Text', content: buildBody(appointment) },
        start: { dateTime: appointment.startsAt, timeZone: appointment.timezone },
        end: { dateTime: appointment.endsAt, timeZone: appointment.timezone },
        attendees: appointment.clientEmail
          ? [
              {
                emailAddress: {
                  address: appointment.clientEmail,
                  name: appointment.clientName ?? undefined,
                },
                type: 'required',
              },
            ]
          : undefined,
      },
      null
    )

    await persistEventId(organizationId, appointmentId, eventId)
  } catch (error) {
    console.error('[microsoft-calendar-sync] create sync failed:', error)
  }
}

export async function handleMicrosoftAppointmentUpdated(
  organizationId: string,
  appointmentId: string
): Promise<void> {
  try {
    const status = await getMicrosoftCalendarConnectionStatus(organizationId)
    if (!status.isConnected) return

    const appointment = await fetchAppointmentForSync(organizationId, appointmentId)
    if (!appointment) return

    const eventId = await upsertMicrosoftCalendarEventForOrg(
      organizationId,
      {
        subject: buildSubject(appointment),
        body: { contentType: 'Text', content: buildBody(appointment) },
        start: { dateTime: appointment.startsAt, timeZone: appointment.timezone },
        end: { dateTime: appointment.endsAt, timeZone: appointment.timezone },
        attendees: appointment.clientEmail
          ? [
              {
                emailAddress: {
                  address: appointment.clientEmail,
                  name: appointment.clientName ?? undefined,
                },
                type: 'required',
              },
            ]
          : undefined,
      },
      appointment.microsoftCalendarEventId
    )

    if (!appointment.microsoftCalendarEventId && eventId) {
      await persistEventId(organizationId, appointmentId, eventId)
    }
  } catch (error) {
    console.error('[microsoft-calendar-sync] update sync failed:', error)
  }
}

export async function handleMicrosoftAppointmentCancelled(
  organizationId: string,
  appointmentId: string
): Promise<void> {
  try {
    const status = await getMicrosoftCalendarConnectionStatus(organizationId)
    if (!status.isConnected) return

    const appointment = await fetchAppointmentForSync(organizationId, appointmentId)
    if (!appointment?.microsoftCalendarEventId) return

    await deleteMicrosoftCalendarEventForOrg(
      organizationId,
      appointment.microsoftCalendarEventId
    )
  } catch (error) {
    console.error('[microsoft-calendar-sync] cancel sync failed:', error)
  }
}
