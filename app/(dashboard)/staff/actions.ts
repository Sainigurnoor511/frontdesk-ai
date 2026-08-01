'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  createStaffSchema,
  updateStaffSchema,
  type CreateStaffInput,
  type UpdateStaffInput,
} from '@/lib/validations/staff'

export async function createStaffMember(
  input: CreateStaffInput
): Promise<{ error: string } | { success: true }> {
  const parsed = createStaffSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to create a staff member.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase.from('staff_members').insert({
    organization_id: member.organization_id,
    full_name: parsed.data.fullName,
    display_name: parsed.data.displayName || null,
    description: parsed.data.description || null,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    is_active: parsed.data.isActive,
    show_on_booking_page: parsed.data.showOnBookingPage,
  })

  if (error) {
    return { error: 'Could not create staff member. Please try again.' }
  }

  revalidatePath('/staff')
  return { success: true }
}

export async function updateStaffMember(
  input: UpdateStaffInput
): Promise<{ error: string } | { success: true }> {
  const parsed = updateStaffSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to update a staff member.' }
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
    .from('staff_members')
    .update({
      full_name: parsed.data.fullName,
      display_name: parsed.data.displayName || null,
      description: parsed.data.description || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      is_active: parsed.data.isActive,
      show_on_booking_page: parsed.data.showOnBookingPage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not update staff member. Please try again.' }
  }

  revalidatePath('/staff')
  return { success: true }
}

export async function deleteStaffMember(
  id: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to delete a staff member.' }
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
    .from('staff_members')
    .delete()
    .eq('id', id)
    .eq('organization_id', member.organization_id)

  if (error) {
    return { error: 'Could not delete staff member. Please try again.' }
  }

  revalidatePath('/staff')
  return { success: true }
}
