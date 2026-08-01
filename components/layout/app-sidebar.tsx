'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  BookOpen,
  Calendar,
  Clock,
  Users,
  UserCog,
  MessageSquare,
  BarChart3,
  Bot,
  Building2,
  Plug,
  BookMarked,
  Settings,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const navSections = [
  {
    label: null,
    items: [
      { title: 'Home', url: '/', icon: Home },
      { title: 'Guides', url: '/guides', icon: BookOpen },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'Calendar', url: '/calendar', icon: Calendar },
      { title: 'Availability', url: '/availability', icon: Clock },
      { title: 'Clients', url: '/clients', icon: Users },
      { title: 'Staff', url: '/staff', icon: UserCog },
      { title: 'Conversations', url: '/conversations', icon: MessageSquare },
      { title: 'Analytics', url: '/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Receptionist',
    items: [{ title: 'AI Agents', url: '/agents', icon: Bot }],
  },
  {
    label: 'Setup',
    items: [
      { title: 'Organization', url: '/organization', icon: Building2 },
      { title: 'Integrations', url: '/integrations', icon: Plug },
      { title: 'Booking Page', url: '/booking-page', icon: BookMarked },
    ],
  },
  {
    label: 'General',
    items: [{ title: 'Settings', url: '/settings', icon: Settings }],
  },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 text-sm font-semibold">FrontDesk.ai</span>
      </SidebarHeader>
      <SidebarContent>
        {navSections.map((section, i) => (
          <SidebarGroup key={i}>
            {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={pathname === item.url}
                      render={<Link href={item.url} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <Card>
          <CardContent className="p-3">
            <p className="text-sm font-medium">Upgrade to Pro</p>
            <p className="text-xs text-muted-foreground">Unlock more agents and minutes.</p>
            <Button size="sm" className="mt-2 w-full">
              Upgrade
            </Button>
          </CardContent>
        </Card>
      </SidebarFooter>
    </Sidebar>
  )
}
