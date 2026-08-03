import { notFound, redirect } from 'next/navigation'
import { getAgentById, getAgentsForOrg } from '@/lib/data/agents'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { AgentDetailClient } from './[id]/agent-detail-client'

export default async function AgentsPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const agents = await getAgentsForOrg(context.org.id)
  if (agents.length === 0) redirect('/onboarding')

  const defaultAgent = agents.find((a) => a.is_default) ?? agents[0]
  const agent = await getAgentById(defaultAgent.id)
  if (!agent) notFound()

  return <AgentDetailClient agent={agent} agents={agents} />
}
