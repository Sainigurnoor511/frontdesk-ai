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

  if (state === 'collapsed') {
    return (
      <Link href="/phone-numbers" className="relative flex size-8 items-center justify-center">
        <div className="size-7 shrink-0 overflow-hidden rounded-lg border bg-card shadow-sm">
          <Orb colors={['#CADCFC', '#A0B9D1']} seed={1} />
        </div>
        <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full border bg-background text-foreground">
          <Plus className="size-2.5" weight="bold" />
        </span>
      </Link>
    )
  }

  return (
    <Link
      href="/phone-numbers"
      className="flex items-center gap-2 rounded-full border bg-card px-2 py-1.5 shadow-sm transition-colors hover:bg-accent"
    >
      <div className="size-6 shrink-0 overflow-hidden rounded-full">
        <Orb colors={['#CADCFC', '#A0B9D1']} seed={1} />
      </div>
      <span className="flex-1 truncate text-sm font-medium">Connect a number</span>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <Phone className="size-3.5" />
      </span>
    </Link>
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
        <div className="flex justify-center px-2 group-data-[collapsible=icon]:px-0">
          <PhoneNumberPill />
        </div>
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
