import { createClient } from '@/lib/supabase/server'

export async function getEnabledIntegrationsForOrg(): Promise<string[]> {
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

  const { data: integrations } = await supabase
    .from('organization_integrations')
    .select('integration_slug')
    .eq('organization_id', member.organization_id)
    .eq('is_enabled', true)

  if (!integrations) return []

  return integrations.map((integration) => integration.integration_slug)
}
