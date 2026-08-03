import { createClient } from '@/lib/supabase/server'

export type EnabledIntegration = {
  slug: string
  config: Record<string, unknown> | null
}

export async function getEnabledIntegrationsForOrg(): Promise<EnabledIntegration[]> {
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
    .select('integration_slug, config')
    .eq('organization_id', member.organization_id)
    .eq('is_enabled', true)

  if (!integrations) return []

  return integrations.map((integration) => ({
    slug: integration.integration_slug,
    config: (integration.config as Record<string, unknown> | null) ?? null,
  }))
}
