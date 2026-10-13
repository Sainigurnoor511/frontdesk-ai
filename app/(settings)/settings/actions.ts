'use server'

import { revalidatePath } from 'next/cache'
import {
  createClient as createSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server'
import {
  updateNotificationSettingsSchema,
  updateFeatureSettingsSchema,
  updateLanguageSchema,
  type UpdateNotificationSettingsInput,
  type UpdateFeatureSettingsInput,
  type UpdateLanguageInput,
} from '@/lib/validations/settings'
import { getAssuredUser } from '@/lib/auth/mfa'
import {
  RECOVERY_CODE_COUNT,
  countUnusedRecoveryCodes,
  deleteUnusedRecoveryCodes,
  issueRecoveryCodes,
} from '@/lib/auth/recovery-codes'

type ActionResult = { error: string } | { success: true }

async function getOrgId(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>
): Promise<{ error: string } | { organizationId: string }> {
  const user = await getAssuredUser(supabase)

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

export async function updateLanguage(input: UpdateLanguageInput): Promise<ActionResult> {
  const parsed = updateLanguageSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('organization_settings').upsert(
    {
      organization_id: orgResult.organizationId,
      language: parsed.data.language,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) {
    return { error: 'Could not save language. Please try again.' }
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

export type TotpEnrollment = {
  factorId: string
  qrCode: string
  secret: string
}

export async function enrollTotpFactor(): Promise<
  { error: string } | { enrollment: TotpEnrollment }
> {
  const supabase = await createSupabaseClient()
  if (!(await getAssuredUser(supabase))) {
    return { error: 'You must be signed in to do this.' }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })

  if (error) {
    return { error: 'Could not start two-factor setup. Please try again.' }
  }

  return {
    enrollment: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    },
  }
}

export async function verifyTotpEnrollment(
  factorId: string,
  code: string
): Promise<{ error: string } | { success: true; recoveryCodes: string[] | null }> {
  const supabase = await createSupabaseClient()
  // Reachable by a session with no verified factor yet — that is what enrollment is — so the gate
  // reads `satisfied` here and this guard is about the un-authenticated case.
  const user = await getAssuredUser(supabase)
  if (!user) {
    return { error: 'You must be signed in to do this.' }
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })

  if (error) {
    return { error: 'That code was incorrect or expired. Please try again.' }
  }

  // A fresh set bound to the factor that just verified (GoTrue only verifies a factor of the
  // session's own user), replacing any unused codes left from an earlier one, which are dead by
  // factor binding anyway. Two-factor is on either way; `null` makes the client say so and point at
  // "Generate recovery codes" instead.
  const issued = await issueRecoveryCodes(createServiceRoleClient(), user.id, factorId)
  return { success: true, recoveryCodes: 'codes' in issued ? issued.codes : null }
}

/**
 * Replaces every recovery code the caller holds with a fresh set and returns it, once. Requires a
 * satisfied gate, so a pending (password-only) session cannot mint codes, and a verified TOTP
 * factor, since a code only ever removes one.
 */
export async function regenerateRecoveryCodes(): Promise<
  { error: string } | { recoveryCodes: string[] }
> {
  const supabase = await createSupabaseClient()
  const user = await getAssuredUser(supabase)
  if (!user) {
    return { error: 'You must be signed in to do this.' }
  }
  // `user.factors` is from the `getUser()` response `getAssuredUser` just validated.
  const totp = (user.factors ?? []).find(
    (factor) => factor.factor_type === 'totp' && factor.status === 'verified'
  )
  if (!totp) {
    return { error: 'Turn on two-factor authentication first.' }
  }

  // Atomic: on failure the previous set is untouched. The client re-reads the count either way.
  const issued = await issueRecoveryCodes(createServiceRoleClient(), user.id, totp.id)
  if ('error' in issued) {
    return { error: 'Could not generate recovery codes. Please try again.' }
  }
  return { recoveryCodes: issued.codes }
}

export async function unenrollTotpFactor(factorId: string): Promise<ActionResult> {
  const supabase = await createSupabaseClient()
  // The one action that can remove a user's second factor, so it does not inherit its security
  // from the proxy. GoTrue very likely refuses an `aal1` unenroll of a verified factor, but
  // "very likely" is not a control: a password-only session must be refused here, in code we own.
  // Consequence worth knowing: a user who has lost their authenticator cannot reach this either,
  // which is why recovery codes exist (`redeemRecoveryCode` on `/verify`) — the gap is not solved
  // by loosening this guard.
  const user = await getAssuredUser(supabase)
  if (!user) {
    return { error: 'You must be signed in to do this.' }
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId })

  if (error) {
    return { error: 'Could not disable two-factor authentication. Please try again.' }
  }

  // The unused codes belonged to the removed factor. A failure here is logged (inside the helper)
  // and harmless: a code is accepted only while the factor it was issued for is verified.
  await deleteUnusedRecoveryCodes(createServiceRoleClient(), user.id)

  return { success: true }
}

/**
 * Recovery-code state for settings. `null` means two-factor is off. Otherwise `total` is the size of
 * a set and `remaining` the unused codes bound to a verified factor, or `null` when the count could
 * not be read, which the page treats as a warning, never as "fine".
 */
export type RecoveryCodeStatus = { remaining: number | null; total: number } | null

export async function getTotpFactorStatus(): Promise<{
  enabled: boolean
  factorId: string | null
  recoveryCodes: RecoveryCodeStatus
}> {
  const supabase = await createSupabaseClient()
  const user = await getAssuredUser(supabase)
  if (!user) {
    return { enabled: false, factorId: null, recoveryCodes: null }
  }

  const { data, error } = await supabase.auth.mfa.listFactors()

  if (error || !data) {
    return { enabled: false, factorId: null, recoveryCodes: null }
  }

  const verifiedTotp = data.totp.filter((factor) => factor.status === 'verified')
  if (verifiedTotp.length === 0) {
    return { enabled: false, factorId: null, recoveryCodes: null }
  }
  return {
    enabled: true,
    factorId: verifiedTotp[0].id,
    recoveryCodes: {
      // A count only: the codes themselves are never readable after they were shown.
      remaining: await countUnusedRecoveryCodes(
        createServiceRoleClient(),
        user.id,
        verifiedTotp.map((factor) => factor.id)
      ),
      total: RECOVERY_CODE_COUNT,
    },
  }
}

export async function sendPasswordResetEmail(): Promise<ActionResult> {
  const supabase = await createSupabaseClient()
  const user = await getAssuredUser(supabase)

  if (!user?.email) {
    return { error: 'Could not determine your email address.' }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${siteUrl}/callback?flow=recovery`,
  })

  if (error) {
    return { error: 'Could not send password reset email. Please try again.' }
  }

  return { success: true }
}
