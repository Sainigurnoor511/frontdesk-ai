import { notFound, redirect } from 'next/navigation'
import { getAgentById, getAgentsForOrg } from '@/lib/data/agents'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { AgentDetailClient } from './agent-detail-client'

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgentById(id)

  if (!agent) notFound()

  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const siblingAgents = await getAgentsForOrg(context.org.id)

  return <AgentDetailClient agent={agent} agents={siblingAgents} />
}
