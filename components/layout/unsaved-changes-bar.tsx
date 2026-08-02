'use client'

import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function UnsavedChangesBar({
  show,
  saving,
  onSave,
  onCancel,
  className,
}: {
  show: boolean
  saving: boolean
  onSave: () => void
  onCancel: () => void
  className?: string
}) {
  if (!show) return null

  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 flex items-center justify-between gap-4 rounded-2xl border bg-background p-3 pl-4 shadow-lg',
        className
      )}
    >
      <div className="flex items-center gap-2.5 text-sm">
        <TriangleAlert className="size-4 shrink-0 text-muted-foreground" />
        You have unsaved changes
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
