'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  buildGoogleCalendarAuthUrl,
  exchangeGoogleCalendarCodeForRefreshToken,
  GOOGLE_CALENDAR_SLUG,
  saveGoogleCalendarConnection,
} from '@/lib/integrations/google-calendar'

function encodeOAuthState(input: { organizationId: string; userId: string }): string {
  return Buffer.from(JSON.stringify(input)).toString('base64url')
}

function decodeOAuthState(state: string): { organizationId: string; userId: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString())
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.organizationId === 'string' &&
      typeof parsed.userId === 'string'
    ) {
      return parsed as { organizationId: string; userId: string }
    }
    return null
  } catch {
    return null
  }
}

export async function initiateGoogleCalendarOAuth(): Promise<{ error: string } | { url: string }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to connect Google Calendar.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const state = encodeOAuthState({ organizationId: member.organization_id, userId: user.id })
  return { url: buildGoogleCalendarAuthUrl(state) }
}

export async function handleGoogleCalendarCallback(
  code: string,
  state: string
): Promise<{ error: string } | { success: true }> {
  const parsedState = decodeOAuthState(state)
  if (!parsedState) return { error: 'Invalid OAuth state.' }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.id !== parsedState.userId) {
    return { error: 'Authentication mismatch.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member || member.organization_id !== parsedState.organizationId) {
    return { error: 'Organization mismatch.' }
  }

  try {
    const refreshToken = await exchangeGoogleCalendarCodeForRefreshToken(code)
    if (!refreshToken) {
      return { error: 'Failed to obtain refresh token. Please reconnect with consent.' }
    }

    await saveGoogleCalendarConnection(member.organization_id, refreshToken, 'primary')
    revalidatePath('/integrations')
    return { success: true }
  } catch (error) {
    console.error('[Google Calendar OAuth] callback failed:', error)
    return { error: 'Failed to complete Google Calendar connection. Please try again.' }
  }
}

export async function disconnectGoogleCalendar(): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to disconnect Google Calendar.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase
    .from('organization_integrations')
    .update({ is_enabled: false, config: {} })
    .eq('organization_id', member.organization_id)
    .eq('integration_slug', GOOGLE_CALENDAR_SLUG)

  if (error) {
    return { error: 'Could not disconnect Google Calendar. Please try again.' }
  }

  revalidatePath('/integrations')
  return { success: true }
}
