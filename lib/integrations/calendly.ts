import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const CALENDLY_SLUG = 'calendly'

type CalendlyConfig = {
  personalAccessToken: string
  eventTypeUri: string
  ownerUri: string
}

function parseCalendlyConfig(config: unknown): CalendlyConfig | null {
  if (!config || typeof config !== 'object') return null
  const record = config as Record<string, unknown>
  if (typeof record.personalAccessToken !== 'string') return null
  if (typeof record.eventTypeUri !== 'string') return null
  if (typeof record.ownerUri !== 'string') return null

  return {
    personalAccessToken: record.personalAccessToken,
    eventTypeUri: record.eventTypeUri,
    ownerUri: record.ownerUri,
  }
}

async function getCalendlyConfig(organizationId: string): Promise<CalendlyConfig | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organization_integrations')
    .select('is_enabled, config')
    .eq('organization_id', organizationId)
    .eq('integration_slug', CALENDLY_SLUG)
    .maybeSingle()

  if (!data || !data.is_enabled) return null
  return parseCalendlyConfig(data.config)
}

async function createSchedulingLink(
  config: CalendlyConfig
): Promise<{ bookingUrl: string | null; schedulingLinkUri: string | null }> {
  const response = await fetch('https://api.calendly.com/scheduling_links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.personalAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      owner: config.ownerUri,
      owner_type: 'EventType',
      max_event_count: 1,
      event_type: config.eventTypeUri,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Calendly scheduling_links failed (${response.status}): ${text}`)
  }

  const json = (await response.json()) as {
    resource?: { booking_url?: string | null; uri?: string | null }
  }

  return {
    bookingUrl: json.resource?.booking_url ?? null,
    schedulingLinkUri: json.resource?.uri ?? null,
  }
}

async function storeSchedulingLink(
  organizationId: string,
  appointmentId: string,
  bookingUrl: string | null
): Promise<void> {
  if (!bookingUrl) return
  const supabase = createServiceRoleClient()
  await supabase
    .from('appointments')
    .update({ calendly_scheduling_url: bookingUrl })
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)
}

export async function handleCalendlyAppointmentCreated(
  organizationId: string,
  appointmentId: string
): Promise<void> {
  try {
    const config = await getCalendlyConfig(organizationId)
    if (!config) return

    const result = await createSchedulingLink(config)
    await storeSchedulingLink(organizationId, appointmentId, result.bookingUrl)
  } catch (error) {
    console.error('[calendly] create sync failed:', error)
  }
}

export async function handleCalendlyAppointmentUpdated(): Promise<void> {
  // Calendly scheduling links are one-time links; no update call is available for
  // an existing booked event through this lightweight integration path.
}

export async function handleCalendlyAppointmentCancelled(): Promise<void> {
  // Cancellation of externally-booked Calendly events is intentionally not
  // attempted in this lightweight integration path.
}
