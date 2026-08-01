'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  businessHoursSchema,
  createExceptionSchema,
  type BusinessHoursInput,
  type CreateExceptionInput,
} from '@/lib/validations/availability'

async function getOrgIdForCurrentUser(): Promise<{ orgId: string } | { error: string }> {
  const supabase = await createClient()
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

  return { orgId: member.organization_id }
}

export async function updateBusinessHours(
  hours: BusinessHoursInput
): Promise<{ error: string } | { success: true }> {
  const parsed = businessHoursSchema.safeParse(hours)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const orgResult = await getOrgIdForCurrentUser()
  if ('error' in orgResult) {
    return orgResult
  }

  const supabase = await createClient()
  const rows = parsed.data.map((day) => ({
    organization_id: orgResult.orgId,
    day_of_week: day.dayOfWeek,
    is_open: day.isOpen,
    start_time: day.startTime ?? null,
    end_time: day.endTime ?? null,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('business_hours')
    .upsert(rows, { onConflict: 'organization_id,day_of_week' })

  if (error) {
    return { error: 'Could not update business hours. Please try again.' }
  }

  revalidatePath('/availability')
  return { success: true }
}

export async function createException(
  input: CreateExceptionInput
): Promise<{ error: string } | { success: true }> {
  const parsed = createExceptionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const orgResult = await getOrgIdForCurrentUser()
  if ('error' in orgResult) {
    return orgResult
  }

  const supabase = await createClient()
  const { error } = await supabase.from('availability_exceptions').insert({
    organization_id: orgResult.orgId,
    name: parsed.data.name,
    type: parsed.data.type,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    start_time: parsed.data.startTime ?? null,
    end_time: parsed.data.endTime ?? null,
    reason: parsed.data.reason ?? null,
  })

  if (error) {
    return { error: 'Could not create exception. Please try again.' }
  }

  revalidatePath('/availability')
  return { success: true }
}

export async function deleteException(
  id: string
): Promise<{ error: string } | { success: true }> {
  const orgResult = await getOrgIdForCurrentUser()
  if ('error' in orgResult) {
    return orgResult
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('availability_exceptions')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgResult.orgId)

  if (error) {
    return { error: 'Could not delete exception. Please try again.' }
  }

  revalidatePath('/availability')
  return { success: true }
}
