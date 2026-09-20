import { notFound, redirect } from 'next/navigation'
import { getAgentById, getAgentsForOrg } from '@/lib/data/agents'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentBlockedNumbers, getAgentPhoneNumbers } from '@/lib/data/phone-numbers'
import { getAgentRules } from '@/lib/data/agent-rules'
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
  const [phoneNumbers, blockedNumbers, rules] = await Promise.all([
    getAgentPhoneNumbers(id),
    getAgentBlockedNumbers(id),
    getAgentRules(id),
  ])
  const { tab } = await searchParams

  return (
    <AgentDetailClient
      agent={agent}
      agents={siblingAgents}
      initialTab={tab}
      phoneNumbers={phoneNumbers}
      blockedNumbers={blockedNumbers}
      rules={rules}
    />
  )
}

// Composed by the root layout's title template into "Receptionist · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Receptionist' }
