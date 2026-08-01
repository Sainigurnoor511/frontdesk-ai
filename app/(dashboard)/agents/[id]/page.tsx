import { notFound } from 'next/navigation'
import { getAgentById } from '@/lib/data/agents'

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgentById(id)

  if (!agent) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{agent.business_name ?? agent.name}</h1>
        <p className="text-muted-foreground">
          {agent.industry} · {agent.country} · {agent.language}
        </p>
      </div>
    </div>
  )
}
