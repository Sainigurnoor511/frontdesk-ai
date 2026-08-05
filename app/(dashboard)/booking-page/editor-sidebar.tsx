'use client'

import {
  Settings,
  Paintbrush,
  Type,
  Sparkles,
  CalendarDays,
  LayoutPanelTop,
  Image as ImageIcon,
  CalendarClock,
  ContactRound,
  ClipboardCheck,
  History,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type EditorSection =
  | 'global'
  | 'theme'
  | 'typography'
  | 'branding'
  | 'calendar'
  | 'layout'
  | 'media'
  | 'forms'
  | 'checklist'
  | 'scheduling'
  | 'history'

type SidebarItem = {
  id: EditorSection
  label: string
  icon: typeof Settings
}

const GLOBAL_SECTIONS: SidebarItem[] = [
  { id: 'global', label: 'Setup', icon: Settings },
  { id: 'theme', label: 'Page', icon: Paintbrush },
  { id: 'typography', label: 'Typography', icon: Type },
  { id: 'branding', label: 'Branding', icon: Sparkles },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'layout', label: 'Header', icon: LayoutPanelTop },
]

const PAGE_SECTIONS: SidebarItem[] = [
  { id: 'media', label: 'Landing', icon: ImageIcon },
  { id: 'scheduling', label: 'Date & time', icon: CalendarClock },
  { id: 'forms', label: 'Personal details', icon: ContactRound },
  { id: 'checklist', label: 'Confirm', icon: ClipboardCheck },
  { id: 'history', label: 'Manage / Reschedule', icon: History },
]

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-1 pb-0.5 pt-1" title={children}>
      <p className="mx-auto max-w-[7ch] truncate text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {children}
      </p>
    </div>
  )
}

function SidebarButton({
  item,
  active,
  onSelect,
}: {
  item: SidebarItem
  active: EditorSection
  onSelect: (section: EditorSection) => void
}) {
  const Icon = item.icon
  const isActive = active === item.id

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-label={item.label}
      title={item.label}
      aria-selected={isActive}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-[7px] px-0 text-sm font-medium transition-all duration-200 ease-out',
        'text-muted-foreground hover:scale-[1.01] hover:bg-muted hover:text-foreground',
        'motion-reduce:transition-none motion-reduce:hover:scale-100',
        isActive && 'scale-[1.04] bg-foreground text-background shadow-sm motion-reduce:scale-100'
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}

export function EditorSidebar({
  active,
  onSelect,
}: {
  active: EditorSection
  onSelect: (section: EditorSection) => void
}) {
  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      className="sticky top-2 z-10 flex w-auto shrink-0 flex-col items-center gap-1 self-start rounded-[10px] border bg-background p-1 transform-gpu"
    >
      <SectionLabel>Global</SectionLabel>
      {GLOBAL_SECTIONS.map((item) => (
        <SidebarButton key={item.id} item={item} active={active} onSelect={onSelect} />
      ))}

      <div className="mx-1 my-1 w-full border-t border-border" aria-hidden="true" />

      <SectionLabel>Pages</SectionLabel>
      {PAGE_SECTIONS.map((item) => (
        <SidebarButton key={item.id} item={item} active={active} onSelect={onSelect} />
      ))}
    </nav>
  )
}
