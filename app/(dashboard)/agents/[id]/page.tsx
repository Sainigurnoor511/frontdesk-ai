import { notFound, redirect } from 'next/navigation'
import { getAgentById, getAgentsForOrg } from '@/lib/data/agents'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentBlockedNumbers, getAgentPhoneNumbers } from '@/lib/data/phone-numbers'
import { AgentDetailClient } from './agent-detail-client'

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const agent = await getAgentById(id)

  if (!agent) notFound()

  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const siblingAgents = await getAgentsForOrg(context.org.id)
  const [phoneNumbers, blockedNumbers] = await Promise.all([
    getAgentPhoneNumbers(id),
    getAgentBlockedNumbers(id),
  ])
  const { tab } = await searchParams

  return (
    <AgentDetailClient
      agent={agent}
      agents={siblingAgents}
      initialTab={tab}
      phoneNumbers={phoneNumbers}
      blockedNumbers={blockedNumbers}
    />
  )
}
