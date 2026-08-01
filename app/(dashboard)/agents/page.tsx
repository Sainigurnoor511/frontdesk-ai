import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg } from '@/lib/data/agents'

export default async function AgentsPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const agents = await getAgentsForOrg(context.org.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Receptionists</h1>
          <p className="text-muted-foreground">Configure your AI receptionists.</p>
        </div>
        <Button render={<Link href="/onboarding" />}>Create receptionist</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {agents.map((agent) => (
          <Link key={agent.id} href={`/agents/${agent.id}`}>
            <Card className="transition-colors hover:bg-accent">
              <CardContent className="space-y-2 p-4">
                <p className="font-medium">{agent.business_name ?? agent.name}</p>
                {agent.industry && (
                  <p className="text-sm text-muted-foreground">{agent.industry}</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
