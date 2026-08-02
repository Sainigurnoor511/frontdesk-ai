'use client'

import { useState } from 'react'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { guides, type Guide } from '@/lib/data/guides'

export default function GuidesPage() {
  const [openGuide, setOpenGuide] = useState<Guide | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Guides</h1>
        <p className="mt-1 text-sm font-normal text-[#96989d]">Learn how to use the product, step by step.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {guides.map((guide) => (
          <Card key={guide.slug}>
            <CardContent className="py-4">
              <button
                type="button"
                className="flex w-full items-start gap-3 text-left"
                onClick={() => setOpenGuide(guide)}
              >
                <guide.icon className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">{guide.title}</p>
                  <p className="text-sm text-muted-foreground">{guide.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{guide.steps.length} steps</Badge>
                  <CaretRight className="size-4 text-muted-foreground" />
                </div>
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={openGuide !== null} onOpenChange={(open) => !open && setOpenGuide(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          {openGuide && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <openGuide.icon className="size-5 shrink-0" />
                  <DialogTitle>{openGuide.title}</DialogTitle>
                </div>
                <DialogDescription>{openGuide.description}</DialogDescription>
              </DialogHeader>

              <ol className="space-y-3 border-t pt-3">
                {openGuide.steps.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {i + 1}
                    </span>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
