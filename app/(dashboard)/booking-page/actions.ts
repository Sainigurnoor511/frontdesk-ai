'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  updateBookingPageSettingsSchema,
  updateBookingPageAppearanceSchema,
  type UpdateBookingPageSettingsInput,
  type UpdateBookingPageAppearanceInput,
} from '@/lib/validations/settings'
import { z } from 'zod'

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

export async function updateBookingPageEnabled(
  input: UpdateBookingPageSettingsInput
): Promise<ActionResult> {
  const parsed = updateBookingPageSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('organization_settings').upsert(
    {
      organization_id: orgResult.organizationId,
      booking_page_enabled: parsed.data.bookingPageEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) {
    return { error: 'Could not save booking page settings. Please try again.' }
  }

  revalidatePath('/booking-page')
  return { success: true }
}

export async function updateBookingPageAppearance(
  input: UpdateBookingPageAppearanceInput
): Promise<ActionResult> {
  const parsed = updateBookingPageAppearanceSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('organization_settings').upsert(
    {
      organization_id: orgResult.organizationId,
      booking_page_theme: parsed.data.bookingPageTheme,
      booking_page_accent: parsed.data.bookingPageAccent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) {
    return { error: 'Could not save booking page appearance. Please try again.' }
  }

  revalidatePath('/booking-page')
  return { success: true }
}

const toggleServiceOnBookingPageSchema = z.object({
  serviceId: z.string().uuid(),
  showOnBookingPage: z.boolean(),
})

export async function toggleServiceOnBookingPage(
  serviceId: string,
  showOnBookingPage: boolean
): Promise<ActionResult> {
  const parsed = toggleServiceOnBookingPageSchema.safeParse({ serviceId, showOnBookingPage })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('services')
    .update({
      show_on_booking_page: parsed.data.showOnBookingPage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.serviceId)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not update service. Please try again.' }
  }

  revalidatePath('/booking-page')
  return { success: true }
}
