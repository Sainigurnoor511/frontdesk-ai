import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg, getAgentById } from '@/lib/data/agents'
import {
  getBusinessProfile,
  getLocations,
  getServices,
  getAssets,
  getProducts,
} from '@/lib/data/business'
import { BusinessClient } from './business-client'

export default async function BusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const { tab } = await searchParams

  const [profile, locations, services, assets, products, agents] = await Promise.all([
    getBusinessProfile(context.org.id),
    getLocations(context.org.id),
    getServices(context.org.id),
    getAssets(context.org.id),
    getProducts(context.org.id),
    getAgentsForOrg(context.org.id),
  ])

  const firstAgent = agents[0] ? await getAgentById(agents[0].id) : null
  const contactPhoneNumber = firstAgent?.staff_phone_number ?? null

  return (
    <BusinessClient
      profile={profile}
      locations={locations}
      services={services}
      assets={assets}
      products={products}
      contactPhoneNumber={contactPhoneNumber}
      initialTab={tab}
    />
  )
}
