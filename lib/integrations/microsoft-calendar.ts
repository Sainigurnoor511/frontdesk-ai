import { decrypt, encrypt } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const MICROSOFT_CALENDAR_SLUG = 'microsoft-calendar'

const MICROSOFT_SCOPES = ['offline_access', 'User.Read', 'Calendars.ReadWrite'] as const

type StoredMicrosoftCalendarConfig = {
  refresh_token: string
  calendar_id?: string
}

type MicrosoftCalendarEventPayload = {
  subject: string
  body: { contentType: 'Text'; content: string }
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  attendees?: {
    emailAddress: { address: string; name?: string }
    type: 'required'
  }[]
}

function getMicrosoftTokenUrl() {
  const tenant = process.env.MICROSOFT_CALENDAR_TENANT_ID?.trim() || 'common'
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
}

function getMicrosoftAuthorizeUrl() {
  const tenant = process.env.MICROSOFT_CALENDAR_TENANT_ID?.trim() || 'common'
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`
}

function getRedirectUri() {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/microsoft-calendar/callback`
}

function parseStoredConfig(config: unknown): StoredMicrosoftCalendarConfig | null {
  if (!config || typeof config !== 'object') return null
  const record = config as Record<string, unknown>
  if (typeof record.refresh_token !== 'string') return null
  return {
    refresh_token: record.refresh_token,
    calendar_id: typeof record.calendar_id === 'string' ? record.calendar_id : undefined,
  }
}

async function readStoredConfig(organizationId: string): Promise<StoredMicrosoftCalendarConfig | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organization_integrations')
    .select('is_enabled, config')
    .eq('organization_id', organizationId)
    .eq('integration_slug', MICROSOFT_CALENDAR_SLUG)
    .maybeSingle()

  if (!data || !data.is_enabled) return null
  return parseStoredConfig(data.config)
}

function buildEventPath(calendarId?: string) {
  return calendarId ? `/me/calendars/${encodeURIComponent(calendarId)}/events` : '/me/events'
}

function buildEventIdPath(eventId: string, calendarId?: string) {
  return calendarId
    ? `/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    : `/me/events/${encodeURIComponent(eventId)}`
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: getRedirectUri(),
    scope: MICROSOFT_SCOPES.join(' '),
  })

  const response = await fetch(getMicrosoftTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Microsoft token refresh failed (${response.status}): ${text}`)
  }

  const json = (await response.json()) as { access_token?: string }
  return json.access_token ?? null
}

async function graphRequest<T>(accessToken: string, path: string, init: RequestInit): Promise<T | null> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Microsoft Graph request failed (${response.status}): ${text}`)
  }

  if (response.status === 204) return null
  return (await response.json()) as T
}

async function getAccessTokenForOrg(
  organizationId: string
): Promise<{ accessToken: string; calendarId?: string } | null> {
  const config = await readStoredConfig(organizationId)
  if (!config) return null

  const refreshToken = decrypt(config.refresh_token)
  const accessToken = await refreshAccessToken(refreshToken)
  if (!accessToken) return null

  return { accessToken, calendarId: config.calendar_id }
}

export function buildMicrosoftCalendarAuthUrl(state: string): string {
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID
  if (!clientId) throw new Error('MICROSOFT_CALENDAR_CLIENT_ID is not set')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    response_mode: 'query',
    scope: MICROSOFT_SCOPES.join(' '),
    state,
    prompt: 'consent',
  })

  return `${getMicrosoftAuthorizeUrl()}?${params.toString()}`
}

export async function exchangeMicrosoftCalendarCodeForRefreshToken(
  code: string
): Promise<string | null> {
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
    scope: MICROSOFT_SCOPES.join(' '),
  })

  const response = await fetch(getMicrosoftTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Microsoft code exchange failed (${response.status}): ${text}`)
  }

  const json = (await response.json()) as { refresh_token?: string }
  return json.refresh_token ?? null
}

export async function saveMicrosoftCalendarConnection(
  organizationId: string,
  refreshToken: string,
  calendarId?: string
): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('organization_integrations').upsert(
    {
      organization_id: organizationId,
      integration_slug: MICROSOFT_CALENDAR_SLUG,
      is_enabled: true,
      config: {
        refresh_token: encrypt(refreshToken),
        ...(calendarId ? { calendar_id: calendarId } : {}),
      },
    },
    { onConflict: 'organization_id,integration_slug' }
  )

  if (error) {
    throw new Error(`Failed to save Microsoft Calendar connection: ${error.message}`)
  }
}

export async function getMicrosoftCalendarConnectionStatus(
  organizationId: string
): Promise<{ isConnected: boolean; calendarId?: string }> {
  const config = await readStoredConfig(organizationId)
  if (!config) return { isConnected: false }
  return { isConnected: true, calendarId: config.calendar_id }
}

export async function upsertMicrosoftCalendarEventForOrg(
  organizationId: string,
  payload: MicrosoftCalendarEventPayload,
  eventId?: string | null
): Promise<string | null> {
  const auth = await getAccessTokenForOrg(organizationId)
  if (!auth) return null

  if (eventId) {
    await graphRequest(auth.accessToken, buildEventIdPath(eventId, auth.calendarId), {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return eventId
  }

  const created = await graphRequest<{ id?: string }>(
    auth.accessToken,
    buildEventPath(auth.calendarId),
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
  return created?.id ?? null
}

export async function deleteMicrosoftCalendarEventForOrg(
  organizationId: string,
  eventId: string
): Promise<void> {
  const auth = await getAccessTokenForOrg(organizationId)
  if (!auth) return

  await graphRequest(auth.accessToken, buildEventIdPath(eventId, auth.calendarId), {
    method: 'DELETE',
  })
}
