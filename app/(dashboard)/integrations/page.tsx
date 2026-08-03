import { getEnabledIntegrationsForOrg } from '@/lib/data/integrations'
import { IntegrationsClient } from './integrations-client'

export default async function IntegrationsPage() {
  const enabledIntegrations = await getEnabledIntegrationsForOrg()

  return <IntegrationsClient enabledIntegrations={enabledIntegrations} />
}
