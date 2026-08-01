import { getClientsForOrg } from '@/lib/data/clients'
import { ClientsClient } from './clients-client'

export default async function ClientsPage() {
  const clients = await getClientsForOrg()

  return <ClientsClient clients={clients} />
}
