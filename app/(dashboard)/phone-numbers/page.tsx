import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg } from '@/lib/data/agents'
import { getPhoneNumbersForOrg } from '@/lib/data/phone-numbers'
import { PhoneNumbersClient } from './phone-numbers-client'

export default async function PhoneNumbersPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const [phoneNumbers, agents] = await Promise.all([
    getPhoneNumbersForOrg(),
    getAgentsForOrg(context.org.id),
  ])

  return <PhoneNumbersClient phoneNumbers={phoneNumbers} agents={agents} />
}

// Composed by the root layout's title template into "Phone numbers · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Phone numbers' }
