import { redirect } from 'next/navigation'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { DashboardMain } from '@/components/layout/dashboard-main'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getAgentsForOrg } from '@/lib/data/agents'
import { getBusinessProfile } from '@/lib/data/business'
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

  const agent = agents.find((a) => a.is_default) ?? agents[0]
  const [hiddenSidebarItems, businessProfile] = await Promise.all([
    getHiddenSidebarItems(context.org.id),
    getBusinessProfile(context.org.id),
  ])
  const businessName = businessProfile.businessName ?? agent.business_name ?? agent.name

  return (
    <SidebarProvider>
      <AppSidebar
        agent={{
          id: agent.id,
          organizationId: agent.organization_id,
          name: businessName,
          staffPhoneNumber: agent.staff_phone_number,
        }}
        hiddenItems={hiddenSidebarItems}
      />
      <SidebarInset className="h-svh overflow-hidden">
        <AppHeader
          email={context.user.email}
          orgName={context.org.name}
          avatarUrl={context.user.avatarUrl}
          businessName={businessName}
        />
        <DashboardMain>{children}</DashboardMain>
      </SidebarInset>
    </SidebarProvider>
  )
}
