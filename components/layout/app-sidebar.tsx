'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  House,
  BookOpen,
  CalendarDays,
  Clock,
  Users,
  UserCog,
  ChartColumn,
  UserCircle,
  Plug,
  BookMarked,
  Settings,
  Ellipsis,
  Phone,
  Pin,
  PinOff,
  MessageCircleMore,
  Lock,
  Sparkles,
  Receipt,
  Wrench,
  Box,
  Package,
  CalendarClock,
  FileText,
  CircleQuestionMark,
  Bot,
  AudioWaveform,
  ListChecks,
  SlidersHorizontal,
} from 'lucide-react'
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Orb } from '@/components/ui/orb'
import { CallDialog } from '@/components/voice/call-dialog'
import { setSidebarItemHidden } from '@/app/(dashboard)/actions/sidebar-preferences'

type NavItem = {
  title: string
  url: string
  icon: typeof House
  badge?: string
}

const navSections: { label: string | null; isSetup?: boolean; items: NavItem[] }[] = [
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
      { title: 'Calendar', url: '/calendar', icon: CalendarDays },
      { title: 'Availability', url: '/availability', icon: Clock },
      { title: 'Clients', url: '/clients', icon: Users },
      { title: 'Staff', url: '/staff', icon: UserCog },
      { title: 'Assistant', url: '/assistant', icon: Sparkles },
      { title: 'Conversations', url: '/conversations', icon: MessageCircleMore },
      { title: 'Analytics', url: '/analytics', icon: ChartColumn },
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
      { title: 'Bookings page', url: '/booking-page', icon: BookMarked },
      { title: 'Settings', url: '/settings', icon: Settings },
    ],
  },
]

const allNavItems: NavItem[] = navSections.flatMap((section) => section.items)

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
        className="h-8 justify-center rounded-[10px] border-2 bg-[linear-gradient(to_right,hsl(217deg_91%_93%),white)] shadow-xs transition-colors group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-none group-data-[collapsible=icon]:shadow-none hover:bg-[linear-gradient(to_right,hsl(217deg_91%_87%),hsl(217deg_91%_97%))]!"
        style={{
          borderColor: 'hsl(228.75deg 47.06% 86.67%)',
        }}
      >
        <div className="size-4 shrink-0 overflow-hidden rounded-sm">
          <Orb seed={1} />
        </div>
        {state !== 'collapsed' && <span>{phoneNumber}</span>}
        {state !== 'collapsed' && <Phone strokeWidth={2.5} className="ml-auto" />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({
  agent,
  hiddenItems,
}: {
  agent: {
    id: string
    organizationId: string
    name: string
    staffPhoneNumber: string | null
  } | null
  hiddenItems: string[]
}) {
  const pathname = usePathname()
  const [lockLayout, setLockLayout] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const { state: sidebarState } = useSidebar()

  // Optimistic local mirror of the server-persisted hidden-items list, so
  // pin/unpin feels instant instead of waiting on a round trip + revalidation.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(hiddenItems))
  const [, startTransition] = useTransition()

  function toggleItemHidden(url: string, nextHidden: boolean) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (nextHidden) next.add(url)
      else next.delete(url)
      return next
    })
    startTransition(async () => {
      const result = await setSidebarItemHidden(url, nextHidden)
      if ('error' in result) {
        // Revert on failure — the server state didn't actually change.
        setHidden((prev) => {
          const reverted = new Set(prev)
          if (nextHidden) reverted.delete(url)
          else reverted.add(url)
          return reverted
        })
      }
    })
  }

  const unpinnedItems = allNavItems.filter((item) => hidden.has(item.url))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-10 gap-0 hover:bg-transparent active:bg-transparent focus-visible:ring-0"
              render={<Link href="/" />}
            >
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
        {navSections.map((section, i) => {
          const visibleItems = section.items.filter((item) => !hidden.has(item.url))
          if (visibleItems.length === 0 && !('isSetup' in section && section.isSetup)) return null

          return (
            <SidebarGroup key={i} className="py-1">
              {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {'isSetup' in section && section.isSetup && agent && (
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={pathname === '/business'} render={<Link href="/business" />}>
                        <House strokeWidth={2.5} />
                        <span>{agent.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {visibleItems.map((item) => (
                    <SidebarMenuItem
                      key={item.url}
                      className={cn('group/nav-item', item.title === 'Settings' && 'mt-3')}
                    >
                      <SidebarMenuButton
                        isActive={pathname === item.url}
                        render={<Link href={item.url} />}
                      >
                        <item.icon strokeWidth={2.5} />
                        <span>{item.title}</span>
                        {item.badge && (
                          <Badge
                            variant="outline"
                            className="h-4 shrink-0 border-current px-1.5 text-[10px] font-medium text-muted-foreground"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                      {sidebarState !== 'collapsed' && (
                        <button
                          type="button"
                          aria-label={`Unpin ${item.title} from sidebar`}
                          onClick={(e) => {
                            e.preventDefault()
                            toggleItemHidden(item.url, true)
                          }}
                          className="absolute top-1/2 right-1 hidden size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/nav-item:flex group-hover/nav-item:opacity-100"
                        >
                          <PinOff className="size-3" />
                        </button>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
        <SidebarGroup className="pt-3">
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Conversations badge (unread count) intentionally omitted here — no
                  live unread-count data source is wired into this component yet. */}
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<SidebarMenuButton />}>
                    <Ellipsis strokeWidth={2.5} />
                    <span>More</span>
                    {unpinnedItems.length > 0 && (
                      <SidebarMenuBadge className="static ml-auto">
                        {unpinnedItems.length}
                      </SidebarMenuBadge>
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top">
                    {unpinnedItems.length > 0 && (
                      <>
                        {unpinnedItems.map((item) => (
                          <DropdownMenuItem
                            key={item.url}
                            onClick={() => toggleItemHidden(item.url, false)}
                          >
                            <item.icon />
                            {item.title}
                            <Pin className="ml-auto size-3.5 text-muted-foreground" />
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <House />
                        {agent ? agent.name : 'Business'}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem render={<Link href="/business?tab=info" />}>
                          <Receipt />
                          Info
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/business?tab=services" />}>
                          <Wrench />
                          Services
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/business?tab=assets" />}>
                          <Box />
                          Assets
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/business?tab=products" />}>
                          <Package />
                          Products
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/business?tab=scheduling" />}>
                          <CalendarClock />
                          Scheduling
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/business?tab=knowledge" />}>
                          <FileText />
                          Knowledge Sources
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/business?tab=faq" />}>
                          <CircleQuestionMark />
                          FAQ
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <UserCircle />
                        Receptionists
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {agent && (
                          <>
                            <DropdownMenuItem render={<Link href={`/agents/${agent.id}?tab=general`} />}>
                              <Bot />
                              General
                            </DropdownMenuItem>
                            <DropdownMenuItem render={<Link href={`/agents/${agent.id}?tab=voices`} />}>
                              <AudioWaveform />
                              Voice
                            </DropdownMenuItem>
                            <DropdownMenuItem render={<Link href={`/agents/${agent.id}?tab=rules`} />}>
                              <ListChecks />
                              Rules
                            </DropdownMenuItem>
                            <DropdownMenuItem render={<Link href={`/agents/${agent.id}?tab=call-settings`} />}>
                              <Phone />
                              Call settings
                            </DropdownMenuItem>
                            <DropdownMenuItem render={<Link href={`/agents/${agent.id}?tab=advanced`} />}>
                              <SlidersHorizontal />
                              Advanced settings
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Settings />
                        Settings
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem render={<Link href="/settings?tab=billing" />}>
                          Billing
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/settings?tab=notifications" />}>
                          Notifications
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/settings?tab=features" />}>
                          Features
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    {/* TODO: persist this preference once a per-user settings table exists */}
                    <DropdownMenuCheckboxItem
                      checked={lockLayout}
                      onCheckedChange={setLockLayout}
                      className="items-start py-1.5"
                    >
                      <Lock className="mt-0.5" />
                      <div className="flex flex-col">
                        <span>Lock sidebar layout</span>
                        <span className="text-xs text-muted-foreground">Keep pinned items fixed</span>
                      </div>
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
