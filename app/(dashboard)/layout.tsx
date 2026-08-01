import { redirect } from 'next/navigation'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { getCurrentOrgAndUser } from '@/lib/data/organization'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentOrgAndUser()

  if (!context) {
    redirect('/login')
  }

  return (
    <SidebarProvider>
      <AppSidebar orgName={context.org.name} />
      <SidebarInset>
        <AppHeader email={context.user.email} orgName={context.org.name} />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
