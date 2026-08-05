'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { applyBookingPageTemplate } from './actions'

const TEMPLATES = [
  {
    id: 'minimal' as const,
    name: 'Minimal',
    description: 'Clean system fonts, medium heading size, tight spacing.',
    preview: { font: 'system-ui', weight: 400 },
  },
  {
    id: 'bold' as const,
    name: 'Bold',
    description: 'Poppins headings, extra-large size, bold weight.',
    preview: { font: 'Poppins', weight: 700 },
  },
  {
    id: 'warm' as const,
    name: 'Warm',
    description: 'Georgia and Merriweather, large heading, medium weight.',
    preview: { font: 'Georgia', weight: 500 },
  },
]

export function TemplatesDialog({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplied: () => void
}) {
  const [, startTransition] = useTransition()
  const [applyingId, setApplyingId] = useState<string | null>(null)

  function handleApply(templateId: (typeof TEMPLATES)[number]['id']) {
    setApplyingId(templateId)
    startTransition(async () => {
      const result = await applyBookingPageTemplate({ templateId })
      setApplyingId(null)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Template applied.')
      onApplied()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Templates</DialogTitle>
          <DialogDescription>
            Apply a preset combination of typography settings to your booking page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between gap-4 rounded-md border p-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'flex size-12 items-center justify-center rounded-md border text-lg font-bold'
                  )}
                  style={{ fontFamily: template.preview.font, fontWeight: template.preview.weight }}
                >
                  Aa
                </div>
                <div>
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={applyingId === template.id}
                onClick={() => handleApply(template.id)}
              >
                {applyingId === template.id ? 'Applying…' : 'Apply'}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
