import { redirect } from 'next/navigation'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg } from '@/lib/data/agents'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentOrgAndUser()

  if (!context) {
    redirect('/login')
  }

  const agents = await getAgentsForOrg(context.org.id)
  if (agents.length === 0) {
    redirect('/onboarding')
  }

  return (
    <SidebarProvider>
      <AppSidebar orgName={context.org.name} />
      <SidebarInset>
        <AppHeader
          email={context.user.email}
          orgName={context.org.name}
          avatarUrl={context.user.avatarUrl}
        />
        <main className="flex-1 p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
