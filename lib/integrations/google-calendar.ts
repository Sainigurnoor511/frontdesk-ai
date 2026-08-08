import { google } from 'googleapis'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decrypt, encrypt } from '@/lib/crypto'

export const GOOGLE_CALENDAR_SLUG = 'google-calendar'

const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const

type StoredGoogleCalendarConfig = {
  refresh_token: string
  calendar_id?: string
}

type CalendarEventPayload = {
  summary: string
  description?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  attendees?: { email: string }[]
}

function getRedirectUri() {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/google-calendar/callback`
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET,
    getRedirectUri()
  )
}

function parseStoredConfig(config: unknown): StoredGoogleCalendarConfig | null {
  if (!config || typeof config !== 'object') return null
  const record = config as Record<string, unknown>
  if (typeof record.refresh_token !== 'string') return null
  return {
    refresh_token: record.refresh_token,
    calendar_id: typeof record.calendar_id === 'string' ? record.calendar_id : 'primary',
  }
}

async function getStoredConfigForOrg(
  organizationId: string
): Promise<StoredGoogleCalendarConfig | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organization_integrations')
    .select('is_enabled, config')
    .eq('organization_id', organizationId)
    .eq('integration_slug', GOOGLE_CALENDAR_SLUG)
    .maybeSingle()

  if (!data || !data.is_enabled) return null
  return parseStoredConfig(data.config)
}

async function getAccessTokenForOrg(organizationId: string): Promise<{ accessToken: string; calendarId: string } | null> {
  const config = await getStoredConfigForOrg(organizationId)
  if (!config) return null

  const refreshToken = decrypt(config.refresh_token)
  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  try {
    const { credentials } = await oauth2Client.refreshAccessToken()
    if (!credentials.access_token) return null
    return {
      accessToken: credentials.access_token,
      calendarId: config.calendar_id ?? 'primary',
    }
  } catch (error) {
    console.error('[google-calendar] failed to refresh access token:', error)
    return null
  }
}

export function buildGoogleCalendarAuthUrl(state: string): string {
  const oauth2Client = getOAuthClient()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_CALENDAR_SCOPES as unknown as string[],
    state,
  })
}

export async function exchangeGoogleCalendarCodeForRefreshToken(code: string): Promise<string | null> {
  const oauth2Client = getOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens.refresh_token ?? null
}

export async function saveGoogleCalendarConnection(
  organizationId: string,
  refreshToken: string,
  calendarId = 'primary'
): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('organization_integrations').upsert(
    {
      organization_id: organizationId,
      integration_slug: GOOGLE_CALENDAR_SLUG,
      is_enabled: true,
      config: {
        refresh_token: encrypt(refreshToken),
        calendar_id: calendarId,
      },
    },
    { onConflict: 'organization_id,integration_slug' }
  )

  if (error) {
    throw new Error(`Failed to save Google Calendar connection: ${error.message}`)
  }
}

export async function getGoogleCalendarConnectionStatus(
  organizationId: string
): Promise<{ isConnected: boolean; calendarId: string }> {
  const config = await getStoredConfigForOrg(organizationId)
  if (!config) return { isConnected: false, calendarId: 'primary' }
  return { isConnected: true, calendarId: config.calendar_id ?? 'primary' }
}

export async function deleteGoogleCalendarEventForOrg(
  organizationId: string,
  eventId: string
): Promise<void> {
  const auth = await getAccessTokenForOrg(organizationId)
  if (!auth) return

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({ access_token: auth.accessToken })
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  await calendar.events.delete({
    calendarId: auth.calendarId,
    eventId,
  })
}

export async function upsertGoogleCalendarEventForOrg(
  organizationId: string,
  payload: CalendarEventPayload,
  eventId?: string | null
): Promise<string | null> {
  const auth = await getAccessTokenForOrg(organizationId)
  if (!auth) return null

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({ access_token: auth.accessToken })
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  if (eventId) {
    await calendar.events.patch({
      calendarId: auth.calendarId,
      eventId,
      requestBody: payload,
    })
    return eventId
  }

  const response = await calendar.events.insert({
    calendarId: auth.calendarId,
    requestBody: payload,
  })
  return response.data.id ?? null
}
