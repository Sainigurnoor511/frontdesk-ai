import { redirect } from 'next/navigation'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg } from '@/lib/data/agents'
import { getHiddenSidebarItems } from '@/lib/data/sidebar-preferences'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentOrgAndUser()

  if (!context) {
    redirect('/login')
  }

  const agents = await getAgentsForOrg(context.org.id)
  if (agents.length === 0) {
    redirect('/onboarding')
  }

  const agent = agents[0]
  const hiddenSidebarItems = await getHiddenSidebarItems(context.org.id)

  return (
    <SidebarProvider>
      <AppSidebar
        orgName={context.org.name}
        agent={{
          id: agent.id,
          organizationId: agent.organization_id,
          name: agent.business_name ?? agent.name,
          staffPhoneNumber: agent.staff_phone_number,
        }}
        hiddenItems={hiddenSidebarItems}
      />
      <SidebarInset className="h-svh overflow-hidden">
        <AppHeader
          email={context.user.email}
          orgName={context.org.name}
          avatarUrl={context.user.avatarUrl}
        />
        <main className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto p-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
