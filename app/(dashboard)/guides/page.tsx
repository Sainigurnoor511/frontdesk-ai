'use client'

import { useState } from 'react'
import { CaretDown, PlayCircle } from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { guides } from '@/lib/data/guides'

export default function GuidesPage() {
  const [openSlug, setOpenSlug] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Guides</h1>
        <p className="text-muted-foreground">Learn how to use the product, step by step.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-white">
          <div className="space-y-1 text-center">
            <p className="text-lg font-semibold">Frontdesk.ai</p>
            <p className="text-sm text-white/70">See the app in action</p>
            <p className="text-xs text-white/50">A quick video walkthrough.</p>
          </div>
          <div className="absolute right-4 bottom-4 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-xs font-medium">
            <PlayCircle />
            Watch
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {guides.map((guide) => {
          const isOpen = openSlug === guide.slug
          return (
            <Card key={guide.slug} className={isOpen ? 'col-span-2' : undefined}>
              <CardContent className="space-y-3 py-4">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => setOpenSlug(isOpen ? null : guide.slug)}
                >
                  <guide.icon className="mt-0.5 size-5 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">{guide.title}</p>
                    <p className="text-sm text-muted-foreground">{guide.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{guide.steps.length} steps</Badge>
                    <CaretDown
                      className={`size-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {isOpen && (
                  <ol className="space-y-3 border-t pt-3">
                    {guide.steps.map((step, i) => (
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
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
