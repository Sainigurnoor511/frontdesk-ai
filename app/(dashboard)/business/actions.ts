'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  updateBusinessProfileSchema,
  createLocationSchema,
  createServiceSchema,
  updateServiceSchema,
  createAssetSchema,
  updateAssetSchema,
  createProductSchema,
  updateProductSchema,
  updateSchedulingSettingsSchema,
  type UpdateBusinessProfileInput,
  type CreateLocationInput,
  type CreateServiceInput,
  type UpdateServiceInput,
  type CreateAssetInput,
  type UpdateAssetInput,
  type CreateProductInput,
  type UpdateProductInput,
  type UpdateSchedulingSettingsInput,
} from '@/lib/validations/business'

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

export async function updateBusinessProfile(
  input: UpdateBusinessProfileInput
): Promise<ActionResult> {
  const parsed = updateBusinessProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('business_profile').upsert(
    {
      organization_id: orgResult.organizationId,
      business_name: parsed.data.businessName || null,
      country: parsed.data.country || null,
      timezone: parsed.data.timezone,
      currency: parsed.data.currency,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) {
    return { error: 'Could not save business profile. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function updateSchedulingSettings(
  input: UpdateSchedulingSettingsInput
): Promise<ActionResult> {
  const parsed = updateSchedulingSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('business_profile').upsert(
    {
      organization_id: orgResult.organizationId,
      booking_slot_interval_minutes: parsed.data.bookingSlotIntervalMinutes,
      advance_booking_window_days: parsed.data.advanceBookingWindowDays,
      minimum_booking_notice_minutes: parsed.data.minimumBookingNoticeMinutes,
      limit_overlapping_appointments: parsed.data.limitOverlappingAppointments,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) {
    return { error: 'Could not save scheduling settings. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function createLocation(input: CreateLocationInput): Promise<ActionResult> {
  const parsed = createLocationSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('business_locations').insert({
    organization_id: orgResult.organizationId,
    name: parsed.data.name,
    address: parsed.data.address || null,
    is_active: parsed.data.isActive,
  })

  if (error) {
    return { error: 'Could not create location. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function createService(input: CreateServiceInput): Promise<ActionResult> {
  const parsed = createServiceSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('services').insert({
    organization_id: orgResult.organizationId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    duration_minutes: parsed.data.durationMinutes,
    price: parsed.data.price,
    service_type: parsed.data.serviceType,
  })

  if (error) {
    return { error: 'Could not create service. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function updateService(input: UpdateServiceInput): Promise<ActionResult> {
  const parsed = updateServiceSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('services')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      duration_minutes: parsed.data.durationMinutes,
      price: parsed.data.price,
      service_type: parsed.data.serviceType,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not update service. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function deleteService(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not delete service. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function createAsset(input: CreateAssetInput): Promise<ActionResult> {
  const parsed = createAssetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('business_assets').insert({
    organization_id: orgResult.organizationId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    is_active: parsed.data.isActive,
  })

  if (error) {
    return { error: 'Could not create asset. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function updateAsset(input: UpdateAssetInput): Promise<ActionResult> {
  const parsed = updateAssetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('business_assets')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      is_active: parsed.data.isActive,
    })
    .eq('id', parsed.data.id)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not update asset. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function deleteAsset(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('business_assets')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not delete asset. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function createProduct(input: CreateProductInput): Promise<ActionResult> {
  const parsed = createProductSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase.from('business_products').insert({
    organization_id: orgResult.organizationId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    price: parsed.data.price,
  })

  if (error) {
    return { error: 'Could not create product. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function updateProduct(input: UpdateProductInput): Promise<ActionResult> {
  const parsed = updateProductSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('business_products')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      price: parsed.data.price,
    })
    .eq('id', parsed.data.id)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not update product. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseClient()
  const orgResult = await getOrgId(supabase)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('business_products')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgResult.organizationId)

  if (error) {
    return { error: 'Could not delete product. Please try again.' }
  }

  revalidatePath('/business')
  return { success: true }
}
