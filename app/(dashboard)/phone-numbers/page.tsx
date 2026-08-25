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
