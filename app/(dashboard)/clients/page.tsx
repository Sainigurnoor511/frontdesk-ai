import { getClientsForOrg } from '@/lib/data/clients'
import { ClientsClient } from './clients-client'

export default async function ClientsPage() {
  const clients = await getClientsForOrg()

  return <ClientsClient clients={clients} />
}

// Composed by the root layout's title template into "Clients · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Clients' }
