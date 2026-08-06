import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg, getAgentById } from '@/lib/data/agents'
import { PhoneNumbersClient } from './phone-numbers-client'

export default async function PhoneNumbersPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const agents = await getAgentsForOrg(context.org.id)
  const defaultAgent = agents.find((a) => a.is_default) ?? agents[0]
  if (!defaultAgent) redirect('/onboarding')

  const agent = await getAgentById(defaultAgent.id)
  if (!agent) redirect('/onboarding')

  return <PhoneNumbersClient agent={agent} />
}
