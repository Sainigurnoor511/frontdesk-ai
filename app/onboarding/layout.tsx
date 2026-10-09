import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg } from '@/lib/data/agents'

export const metadata = { title: 'Set up your receptionist' }

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentOrgAndUser()

  if (!context) {
    redirect('/login')
  }

  const agents = await getAgentsForOrg(context.org.id)
  if (agents.length > 0) {
    redirect('/')
  }

  return <div className="min-h-dvh bg-background">{children}</div>
}
