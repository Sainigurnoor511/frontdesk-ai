import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg } from '@/lib/data/agents'

// Declared on the layout rather than the page because `onboarding/page.tsx` is a
// client component, and client components can't export `metadata`.
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

  return <div className="min-h-screen bg-background">{children}</div>
}
