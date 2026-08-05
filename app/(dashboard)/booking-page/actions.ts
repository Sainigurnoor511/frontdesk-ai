'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  updateBookingPageSettingsSchema,
  updateBookingPageAppearanceSchema,
  type UpdateBookingPageSettingsInput,
  type UpdateBookingPageAppearanceInput,
} from '@/lib/validations/settings'
import {
  updateTypographySchema,
  updateBrandingSchema,
  updateLayoutSchema,
  updateMediaSchema,
  updateFormsSchema,
  updateConfirmationRulesSchema,
  updateGlobalBookingFlowSchema,
  updateCalendarConfigSchema,
  restoreBookingPageVersionSchema,
  updateOrganizationSlugSchema,
  applyBookingPageTemplateSchema,
  type UpdateTypographyInput,
  type UpdateBrandingInput,
  type UpdateLayoutInput,
  type UpdateMediaInput,
  type UpdateFormsInput,
  type UpdateConfirmationRulesInput,
  type UpdateGlobalBookingFlowInput,
  type UpdateCalendarConfigInput,
  type RestoreBookingPageVersionInput,
  type UpdateOrganizationSlugInput,
  type ApplyBookingPageTemplateInput,
} from '@/lib/validations/booking-page-config'
import { z } from 'zod'

type ActionResult = { error: string } | { success: true }

const BOOKING_PAGE_CONFIG_COLUMNS =
  'heading_font, body_font, heading_size, body_size, font_weight, line_height, letter_spacing, logo_url, tagline, business_description, receptionist_position, show_header, show_service_descriptions, show_prices, background_image_url, background_video_url, custom_fields, require_email_verification, auto_confirm_bookings, cancellation_policy_text, cancellation_notice_hours, auto_greet_on_load, show_phone_fallback, call_widget_position, show_staff_selection, show_receptionist_on_booking_page, receptionist_only'

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

/**
 * Upserts a partial set of booking_page_config columns, then snapshots the
 * resulting full row into booking_page_config_versions so the History
 * section can list and restore prior states. Snapshotting after the upsert
 * (not before) means every version row represents a real, saved state.
 */
async function saveBookingPageConfigSection(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  organizationId: string,
  patch: Record<string, unknown>
): Promise<{ error: string } | { success: true }> {
  const { error: upsertError } = await supabase.from('booking_page_config').upsert(
    {
      organization_id: organizationId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (upsertError) {
    return { error: 'Could not save changes. Please try again.' }
  }

  const { data: fullRow } = await supabase
    .from('booking_page_config')
    .select(BOOKING_PAGE_CONFIG_COLUMNS)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (fullRow) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Version history is best-effort — a failed snapshot insert never fails
    // the actual settings save that already succeeded above.
    await supabase.from('booking_page_config_versions').insert({
      organization_id: organizationId,
      snapshot: fullRow,
      created_by: user?.id ?? null,
    })
  }

  revalidatePath('/booking-page')
  return { success: true }
}

export async function updateTypography(input: UpdateTypographyInput): Promise<ActionResult> {
  const parsed = updateTypographySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  return saveBookingPageConfigSection(supabase, orgResult.organizationId, {
    heading_font: parsed.data.headingFont,
    body_font: parsed.data.bodyFont,
    heading_size: parsed.data.headingSize,
    body_size: parsed.data.bodySize,
    font_weight: parsed.data.fontWeight,
    line_height: parsed.data.lineHeight,
    letter_spacing: parsed.data.letterSpacing,
  })
}

export async function updateBranding(input: UpdateBrandingInput): Promise<ActionResult> {
  const parsed = updateBrandingSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  return saveBookingPageConfigSection(supabase, orgResult.organizationId, {
    logo_url: parsed.data.logoUrl,
    tagline: parsed.data.tagline,
    business_description: parsed.data.businessDescription,
  })
}

export async function updateLayout(input: UpdateLayoutInput): Promise<ActionResult> {
  const parsed = updateLayoutSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  return saveBookingPageConfigSection(supabase, orgResult.organizationId, {
    receptionist_position: parsed.data.receptionistPosition,
    show_header: parsed.data.showHeader,
    show_service_descriptions: parsed.data.showServiceDescriptions,
    show_prices: parsed.data.showPrices,
  })
}

export async function updateMedia(input: UpdateMediaInput): Promise<ActionResult> {
  const parsed = updateMediaSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  return saveBookingPageConfigSection(supabase, orgResult.organizationId, {
    background_image_url: parsed.data.backgroundImageUrl,
    background_video_url: parsed.data.backgroundVideoUrl,
  })
}

export async function updateForms(input: UpdateFormsInput): Promise<ActionResult> {
  const parsed = updateFormsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  return saveBookingPageConfigSection(supabase, orgResult.organizationId, {
    custom_fields: parsed.data.customFields,
  })
}

export async function updateConfirmationRules(
  input: UpdateConfirmationRulesInput
): Promise<ActionResult> {
  const parsed = updateConfirmationRulesSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  return saveBookingPageConfigSection(supabase, orgResult.organizationId, {
    require_email_verification: parsed.data.requireEmailVerification,
    auto_confirm_bookings: parsed.data.autoConfirmBookings,
    cancellation_policy_text: parsed.data.cancellationPolicyText,
    cancellation_notice_hours: parsed.data.cancellationNoticeHours,
  })
}

export async function updateGlobalBookingFlow(
  input: UpdateGlobalBookingFlowInput
): Promise<ActionResult> {
  const parsed = updateGlobalBookingFlowSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  return saveBookingPageConfigSection(supabase, orgResult.organizationId, {
    show_staff_selection: parsed.data.showStaffSelection,
    show_receptionist_on_booking_page: parsed.data.showReceptionistOnBookingPage,
    receptionist_only: parsed.data.receptionistOnly,
    auto_greet_on_load: parsed.data.autoGreetOnLoad,
    show_phone_fallback: parsed.data.showPhoneFallback,
    call_widget_position: parsed.data.callWidgetPosition,
  })
}

export async function updateCalendarConfig(input: UpdateCalendarConfigInput): Promise<ActionResult> {
  const parsed = updateCalendarConfigSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('business_profile').upsert(
    {
      organization_id: orgResult.organizationId,
      booking_slot_interval_minutes: parsed.data.bookingSlotIntervalMinutes,
      advance_booking_window_days: parsed.data.advanceBookingWindowDays,
      minimum_booking_notice_minutes: parsed.data.minimumBookingNoticeMinutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) {
    return { error: 'Could not save calendar settings. Please try again.' }
  }

  revalidatePath('/booking-page')
  return { success: true }
}

export type BookingPageConfigVersion = {
  id: string
  createdAt: string
}

export async function getBookingPageConfigVersions(): Promise<
  { error: string } | { versions: BookingPageConfigVersion[] }
> {
  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { data, error } = await supabase
    .from('booking_page_config_versions')
    .select('id, created_at')
    .eq('organization_id', orgResult.organizationId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return { error: 'Could not load version history.' }
  }

  return {
    versions: (data ?? []).map((row) => ({ id: row.id, createdAt: row.created_at })),
  }
}

export async function restoreBookingPageConfigVersion(
  input: RestoreBookingPageVersionInput
): Promise<ActionResult> {
  const parsed = restoreBookingPageVersionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { data: version, error: fetchError } = await supabase
    .from('booking_page_config_versions')
    .select('snapshot')
    .eq('id', parsed.data.versionId)
    .eq('organization_id', orgResult.organizationId)
    .maybeSingle()

  if (fetchError || !version) {
    return { error: 'Version not found.' }
  }

  return saveBookingPageConfigSection(
    supabase,
    orgResult.organizationId,
    version.snapshot as Record<string, unknown>
  )
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

export async function updateOrganizationSlug(
  input: UpdateOrganizationSlugInput
): Promise<{ error: string } | { success: true; slug: string }> {
  const parsed = updateOrganizationSlugSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', parsed.data.slug)
    .maybeSingle()

  if (existing && existing.id !== orgResult.organizationId) {
    return { error: 'That URL is already taken. Please choose another.' }
  }

  const { error } = await supabase
    .from('organizations')
    .update({ slug: parsed.data.slug })
    .eq('id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not update the booking page URL. Please try again.' }
  }

  revalidatePath('/booking-page')
  return { success: true, slug: parsed.data.slug }
}

const BOOKING_PAGE_TEMPLATES: Record<
  ApplyBookingPageTemplateInput['templateId'],
  Record<string, unknown>
> = {
  minimal: {
    heading_font: 'system-ui',
    body_font: 'system-ui',
    heading_size: 'md',
    font_weight: 'normal',
    letter_spacing: 'normal',
  },
  bold: {
    heading_font: 'Poppins',
    body_font: 'Inter',
    heading_size: 'xl',
    font_weight: 'bold',
    letter_spacing: 'tight',
  },
  warm: {
    heading_font: 'Georgia',
    body_font: 'Merriweather',
    heading_size: 'lg',
    font_weight: 'medium',
    letter_spacing: 'normal',
  },
}

export async function applyBookingPageTemplate(
  input: ApplyBookingPageTemplateInput
): Promise<ActionResult> {
  const parsed = applyBookingPageTemplateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  return saveBookingPageConfigSection(
    supabase,
    orgResult.organizationId,
    BOOKING_PAGE_TEMPLATES[parsed.data.templateId]
  )
}
