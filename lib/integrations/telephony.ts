import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const TWILIO_SLUG = 'twilio'
export const PLIVO_SLUG = 'plivo'
export const SIP_TRUNK_SLUG = 'sip-trunk'

type TelephonyConfig = {
  webCallsOnly?: boolean
}

async function readIntegrationConfig(organizationId: string, slug: string) {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organization_integrations')
    .select('is_enabled, config')
    .eq('organization_id', organizationId)
    .eq('integration_slug', slug)
    .maybeSingle()

  if (!data || !data.is_enabled) return null
  return (data.config as TelephonyConfig | null) ?? null
}

export async function isPhoneProvisioningEnabled(organizationId: string): Promise<boolean> {
  const [twilio, plivo, sip] = await Promise.all([
    readIntegrationConfig(organizationId, TWILIO_SLUG),
    readIntegrationConfig(organizationId, PLIVO_SLUG),
    readIntegrationConfig(organizationId, SIP_TRUNK_SLUG),
  ])

  const configs = [twilio, plivo, sip].filter(Boolean) as TelephonyConfig[]
  if (configs.length === 0) return false
  return configs.some((cfg) => cfg.webCallsOnly === false)
}
