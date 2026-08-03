'use client'

import {
  Settings,
  Wand2,
  Type,
  Sparkles,
  CalendarDays,
  LayoutGrid,
  Image as ImageIcon,
  ClipboardList,
  ListChecks,
  CalendarClock,
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

const SECTIONS: { id: EditorSection; label: string; icon: typeof Settings }[] = [
  { id: 'global', label: 'Global settings', icon: Settings },
  { id: 'theme', label: 'Theme', icon: Wand2 },
  { id: 'typography', label: 'Typography', icon: Type },
  { id: 'branding', label: 'Branding', icon: Sparkles },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'layout', label: 'Layout', icon: LayoutGrid },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'forms', label: 'Forms', icon: ClipboardList },
  { id: 'checklist', label: 'Confirmation rules', icon: ListChecks },
  { id: 'scheduling', label: 'Scheduling rules', icon: CalendarClock },
  { id: 'history', label: 'History', icon: History },
]

export function EditorSidebar({
  active,
  onSelect,
}: {
  active: EditorSection
  onSelect: (section: EditorSection) => void
}) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r py-3">
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          aria-label={label}
          title={label}
          className={cn(
            'flex size-10 items-center justify-center rounded-lg transition-colors',
            active === id
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon className="size-4.5" />
        </button>
      ))}
    </nav>
  )
}
