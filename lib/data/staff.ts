import { createClient } from '@/lib/supabase/server'

export type StaffMember = {
  id: string
  fullName: string
  displayName: string | null
  description: string | null
  email: string | null
  phone: string | null
  isActive: boolean
  showOnBookingPage: boolean
  createdAt: string
}

export async function getStaffForOrg(): Promise<StaffMember[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) return []

  const { data: staff } = await supabase
    .from('staff_members')
    .select(
      'id, full_name, display_name, description, email, phone, is_active, show_on_booking_page, created_at'
    )
    .eq('organization_id', member.organization_id)
    .order('created_at', { ascending: false })

  if (!staff) return []

  return staff.map((member) => ({
    id: member.id,
    fullName: member.full_name,
    displayName: member.display_name,
    description: member.description,
    email: member.email,
    phone: member.phone,
    isActive: member.is_active,
    showOnBookingPage: member.show_on_booking_page,
    createdAt: member.created_at,
  }))
}
