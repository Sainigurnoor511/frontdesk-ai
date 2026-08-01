import { getEnabledIntegrationsForOrg } from '@/lib/data/integrations'
import { IntegrationsClient } from './integrations-client'

export default async function IntegrationsPage() {
  const enabledIntegrationSlugs = await getEnabledIntegrationsForOrg()

  return <IntegrationsClient enabledIntegrationSlugs={enabledIntegrationSlugs} />
}
