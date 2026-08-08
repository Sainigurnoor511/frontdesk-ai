'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  buildMicrosoftCalendarAuthUrl,
  exchangeMicrosoftCalendarCodeForRefreshToken,
  MICROSOFT_CALENDAR_SLUG,
  saveMicrosoftCalendarConnection,
} from '@/lib/integrations/microsoft-calendar'

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

export async function initiateMicrosoftCalendarOAuth(): Promise<{ error: string } | { url: string }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to connect Microsoft Calendar.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  try {
    const state = encodeOAuthState({ organizationId: member.organization_id, userId: user.id })
    return { url: buildMicrosoftCalendarAuthUrl(state) }
  } catch {
    return { error: 'Microsoft Calendar OAuth is not configured on this deployment.' }
  }
}

export async function handleMicrosoftCalendarCallback(
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
    const refreshToken = await exchangeMicrosoftCalendarCodeForRefreshToken(code)
    if (!refreshToken) {
      return { error: 'Failed to obtain refresh token. Please reconnect with consent.' }
    }

    await saveMicrosoftCalendarConnection(member.organization_id, refreshToken)
    revalidatePath('/integrations')
    return { success: true }
  } catch (error) {
    console.error('[Microsoft Calendar OAuth] callback failed:', error)
    return { error: 'Failed to complete Microsoft Calendar connection. Please try again.' }
  }
}

export async function disconnectMicrosoftCalendar(): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to disconnect Microsoft Calendar.' }
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
    .eq('integration_slug', MICROSOFT_CALENDAR_SLUG)

  if (error) {
    return { error: 'Could not disconnect Microsoft Calendar. Please try again.' }
  }

  revalidatePath('/integrations')
  return { success: true }
}
