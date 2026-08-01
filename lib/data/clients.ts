import { createClient } from '@/lib/supabase/server'

export type Client = {
  id: string
  name: string
  phoneNumber: string
  email: string | null
  notes: string | null
  createdAt: string
}

export async function getClientsForOrg(): Promise<Client[]> {
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

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, phone_number, email, notes, created_at')
    .eq('organization_id', member.organization_id)
    .order('created_at', { ascending: false })

  if (!clients) return []

  return clients.map((client) => ({
    id: client.id,
    name: client.name,
    phoneNumber: client.phone_number,
    email: client.email,
    notes: client.notes,
    createdAt: client.created_at,
  }))
}
