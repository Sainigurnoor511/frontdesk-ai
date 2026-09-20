import { notFound, redirect } from 'next/navigation'
import { getAgentById, getAgentsForOrg } from '@/lib/data/agents'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentBlockedNumbers, getAgentPhoneNumbers } from '@/lib/data/phone-numbers'
import { getAgentRules } from '@/lib/data/agent-rules'
import { AgentDetailClient } from './[id]/agent-detail-client'

export default async function AgentsPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const agents = await getAgentsForOrg(context.org.id)
  if (agents.length === 0) redirect('/onboarding')

  const defaultAgent = agents.find((a) => a.is_default) ?? agents[0]
  const agent = await getAgentById(defaultAgent.id)
  if (!agent) notFound()

  const [phoneNumbers, blockedNumbers, rules] = await Promise.all([
    getAgentPhoneNumbers(agent.id),
    getAgentBlockedNumbers(agent.id),
    getAgentRules(agent.id),
  ])

  return (
    <AgentDetailClient
      agent={agent}
      agents={agents}
      phoneNumbers={phoneNumbers}
      blockedNumbers={blockedNumbers}
      rules={rules}
    />
  )
}

// Composed by the root layout's title template into "Receptionists · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Receptionists' }
