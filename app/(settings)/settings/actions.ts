'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  updateNotificationSettingsSchema,
  updateFeatureSettingsSchema,
  type UpdateNotificationSettingsInput,
  type UpdateFeatureSettingsInput,
} from '@/lib/validations/settings'

type ActionResult = { error: string } | { success: true }

async function getOrgId(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>
): Promise<{ error: string } | { organizationId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to do this.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  return { organizationId: member.organization_id }
}

export async function updateNotificationSettings(
  input: UpdateNotificationSettingsInput
): Promise<ActionResult> {
  const parsed = updateNotificationSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const update: Record<string, unknown> = {
    organization_id: orgResult.organizationId,
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.notifyPostCallSummary !== undefined) {
    update.notify_post_call_summary = parsed.data.notifyPostCallSummary
  }
  if (parsed.data.notifyAppointmentReminders !== undefined) {
    update.notify_appointment_reminders = parsed.data.notifyAppointmentReminders
  }
  if (parsed.data.notifyClientBookings !== undefined) {
    update.notify_client_bookings = parsed.data.notifyClientBookings
  }
  if (parsed.data.notifyStaffBookings !== undefined) {
    update.notify_staff_bookings = parsed.data.notifyStaffBookings
  }

  const { error } = await supabase
    .from('organization_settings')
    .upsert(update, { onConflict: 'organization_id' })

  if (error) {
    return { error: 'Could not save notification settings. Please try again.' }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function updateFeatureSettings(
  input: UpdateFeatureSettingsInput
): Promise<ActionResult> {
  const parsed = updateFeatureSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const fieldMap: Record<keyof UpdateFeatureSettingsInput, string> = {
    featureServices: 'feature_services',
    featureStaff: 'feature_staff',
    featureAssets: 'feature_assets',
    featureProducts: 'feature_products',
    featureAvailability: 'feature_availability',
    featureCustomTimezones: 'feature_custom_timezones',
    featureBookingPage: 'feature_booking_page',
    featureMessages: 'feature_messages',
    featureFaq: 'feature_faq',
    featureAppointments: 'feature_appointments',
    featureHomeMobile: 'feature_home_mobile',
    featureGroupSessions: 'feature_group_sessions',
    featureRentals: 'feature_rentals',
    featureGuides: 'feature_guides',
  }

  const update: Record<string, unknown> = {
    organization_id: orgResult.organizationId,
    updated_at: new Date().toISOString(),
  }
  for (const key of Object.keys(fieldMap) as (keyof UpdateFeatureSettingsInput)[]) {
    const value = parsed.data[key]
    if (value !== undefined) {
      update[fieldMap[key]] = value
    }
  }

  const { error } = await supabase
    .from('organization_settings')
    .upsert(update, { onConflict: 'organization_id' })

  if (error) {
    return { error: 'Could not save feature settings. Please try again.' }
  }

  revalidatePath('/settings')
  return { success: true }
}
