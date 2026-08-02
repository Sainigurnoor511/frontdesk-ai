'use client'

import { useState } from 'react'
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
  Storefront,
  Plug,
  BookBookmark,
  Gear,
  DotsThree,
  Phone,
  X,
  ChatCircleDots,
  LockSimple,
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Orb } from '@/components/ui/orb'
import { CallDialog } from '@/components/voice/call-dialog'

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
      { title: 'Business', url: '/business', icon: Storefront },
      { title: 'Integrations', url: '/integrations', icon: Plug, badge: 'Alpha' },
      { title: 'Bookings page', url: '/booking-page', icon: BookBookmark },
      { title: 'Settings', url: '/settings', icon: Gear },
    ],
  },
]

const DUMMY_PHONE_NUMBER = '+1 (415) 555-0100'

function CallReceptionistPill({
  phoneNumber,
  onClick,
}: {
  phoneNumber: string
  onClick: () => void
}) {
  const { state } = useSidebar()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onClick}
        className="rounded-[10px] border-2 bg-[linear-gradient(to_right,hsl(217deg_91%_93%),white)] shadow-xs transition-colors hover:bg-[linear-gradient(to_right,hsl(217deg_91%_87%),hsl(217deg_91%_97%))]!"
        style={{
          borderColor: 'hsl(228.75deg 47.06% 86.67%)',
        }}
      >
        <div className="size-4 shrink-0 overflow-hidden rounded-sm">
          <Orb seed={1} />
        </div>
        <span>{phoneNumber}</span>
        {state !== 'collapsed' && <Phone weight="bold" className="ml-auto" />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({
  orgName,
  agent,
}: {
  orgName: string
  agent: {
    id: string
    organizationId: string
    name: string
    staffPhoneNumber: string | null
  } | null
}) {
  const pathname = usePathname()
  const [lockLayout, setLockLayout] = useState(false)
  const [callOpen, setCallOpen] = useState(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-10 gap-0 hover:bg-transparent" render={<Link href="/" />}>
              <span className="text-base font-semibold">F</span>
              <span className="text-base font-semibold tracking-tight">rontdesk.ai</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {agent && (
          <SidebarMenu>
            <CallReceptionistPill
              phoneNumber={agent.staffPhoneNumber ?? DUMMY_PHONE_NUMBER}
              onClick={() => setCallOpen(true)}
            />
          </SidebarMenu>
        )}
      </SidebarHeader>
      <SidebarContent className="gap-0 py-1">
        {navSections.map((section, i) => (
          <SidebarGroup key={i} className="py-1">
            {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {'isSetup' in section && section.isSetup && (
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={pathname === '/organization'} render={<Link href="/organization" />}>
                      <House weight="bold" />
                      <span>{orgName}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.url} className="group/nav-item">
                    <SidebarMenuButton
                      isActive={pathname === item.url}
                      render={<Link href={item.url} />}
                    >
                      <item.icon weight="bold" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {'badge' in item && item.badge && (
                      <SidebarMenuBadge>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-medium">
                          {item.badge}
                        </Badge>
                      </SidebarMenuBadge>
                    )}
                    {/* TODO: persist per-user sidebar item visibility once a preferences table exists */}
                    <button
                      type="button"
                      aria-label={`Remove ${item.title} from sidebar`}
                      className="absolute top-1/2 right-1 hidden size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/nav-item:flex group-hover/nav-item:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
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
                <DropdownMenu>
                  <DropdownMenuTrigger render={<SidebarMenuButton />}>
                    <DotsThree weight="bold" />
                    <span>More</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top">
                    {/* TODO: open the Assistant panel from here once it's lifted to shared layout state */}
                    <DropdownMenuItem disabled>
                      <ChatCircleDots />
                      Assistant
                    </DropdownMenuItem>
                    <DropdownMenuItem render={<Link href="/business" />}>
                      <Storefront />
                      Business
                    </DropdownMenuItem>
                    <DropdownMenuItem render={<Link href="/agents" />}>
                      <UserCircle />
                      Receptionists
                    </DropdownMenuItem>
                    <DropdownMenuItem render={<Link href="/settings" />}>
                      <Gear />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {/* TODO: persist this preference once a per-user settings table exists */}
                    <DropdownMenuCheckboxItem
                      checked={lockLayout}
                      onCheckedChange={setLockLayout}
                    >
                      <LockSimple />
                      Lock sidebar layout
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {agent && (
        <CallDialog
          open={callOpen}
          onOpenChange={setCallOpen}
          organizationId={agent.organizationId}
          agentId={agent.id}
          agentName={agent.name}
          staffPhoneNumber={agent.staffPhoneNumber}
          authenticated
        />
      )}
    </Sidebar>
  )
}
