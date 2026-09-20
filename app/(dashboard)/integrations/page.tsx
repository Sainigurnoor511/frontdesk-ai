import { getEnabledIntegrationsForOrg } from '@/lib/data/integrations'
import { IntegrationsClient } from './integrations-client'

export default async function IntegrationsPage() {
  const enabledIntegrations = await getEnabledIntegrationsForOrg()

  return <IntegrationsClient enabledIntegrations={enabledIntegrations} />
}

// Composed by the root layout's title template into "Integrations · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Integrations' }
