'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  House,
  BookOpen,
  Calendar,
  Clock,
  Users,
  UserGear,
  ChatCircle,
  ChartBar,
  UserCircle,
  Plug,
  BookBookmark,
  Gear,
  DotsThree,
  Phone,
  Plus,
} from '@phosphor-icons/react/dist/ssr'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Orb } from '@/components/ui/orb'

const navSections = [
  {
    label: null,
    items: [
      { title: 'Home', url: '/', icon: House },
      { title: 'Guides', url: '/guides', icon: BookOpen },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'Calendar', url: '/calendar', icon: Calendar },
      { title: 'Availability', url: '/availability', icon: Clock },
      { title: 'Clients', url: '/clients', icon: Users },
      { title: 'Staff', url: '/staff', icon: UserGear },
      { title: 'Conversations', url: '/conversations', icon: ChatCircle },
      { title: 'Analytics', url: '/analytics', icon: ChartBar },
    ],
  },
  {
    label: 'Receptionist',
    items: [{ title: 'Receptionists', url: '/agents', icon: UserCircle }],
  },
  {
    label: 'Setup',
    isSetup: true,
    items: [
      { title: 'Integrations', url: '/integrations', icon: Plug, badge: 'Alpha' },
      { title: 'Bookings page', url: '/booking-page', icon: BookBookmark },
      { title: 'Settings', url: '/settings', icon: Gear },
    ],
  },
]

function PhoneNumberPill() {
  const { state } = useSidebar()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton render={<Link href="/phone-numbers" />}>
        <div className="relative size-4 shrink-0">
          <div className="size-4 overflow-hidden rounded-sm">
            <Orb colors={['#CADCFC', '#A0B9D1']} seed={1} />
          </div>
          {state === 'collapsed' && (
            <span className="absolute -right-1 -bottom-1 flex size-2.5 items-center justify-center rounded-full border bg-background text-foreground">
              <Plus className="size-2" weight="bold" />
            </span>
          )}
        </div>
        <span>Connect a number</span>
        {state !== 'collapsed' && <Phone className="ml-auto" />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="hover:bg-transparent" render={<Link href="/" />}>
              <span className="text-lg font-semibold tracking-tight">
                <span className="text-foreground">F</span>
                <span className="font-medium text-muted-foreground">rontDesk</span>
                <span className="font-medium text-muted-foreground">.ai</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <PhoneNumberPill />
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0.5 py-2">
        {navSections.map((section, i) => (
          <SidebarGroup key={i}>
            {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {'isSetup' in section && section.isSetup && (
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={pathname === '/organization'} render={<Link href="/organization" />}>
                      <House />
                      <span>{orgName}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={pathname === item.url}
                      render={<Link href={item.url} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {'badge' in item && item.badge && (
                      <SidebarMenuBadge>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-medium">
                          {item.badge}
                        </Badge>
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <DotsThree />
                  <span>More</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
