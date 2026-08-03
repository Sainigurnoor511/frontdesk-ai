'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { updateLayout } from '../actions'

export function LayoutSection({ config }: { config: BookingPageConfig }) {
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [receptionistPosition, setReceptionistPosition] = useState(config.receptionistPosition)
  const [showHeader, setShowHeader] = useState(config.showHeader)
  const [showServiceDescriptions, setShowServiceDescriptions] = useState(config.showServiceDescriptions)
  const [showPrices, setShowPrices] = useState(config.showPrices)

  const dirty =
    receptionistPosition !== config.receptionistPosition ||
    showHeader !== config.showHeader ||
    showServiceDescriptions !== config.showServiceDescriptions ||
    showPrices !== config.showPrices

  function handleSave() {
    setSaving(true)
    startTransition(async () => {
      const result = await updateLayout({
        receptionistPosition,
        showHeader,
        showServiceDescriptions,
        showPrices,
      })
      setSaving(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Layout saved.')
    })
  }

  function handleCancel() {
    setReceptionistPosition(config.receptionistPosition)
    setShowHeader(config.showHeader)
    setShowServiceDescriptions(config.showServiceDescriptions)
    setShowPrices(config.showPrices)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Layout</h2>
        <p className="text-sm text-muted-foreground">How the public booking page is structured.</p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">Receptionist panel position</span>
            <div className="flex items-center gap-2">
              {(['left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setReceptionistPosition(side)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                    receptionistPosition === side
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">Show header</p>
            <Switch checked={showHeader} onCheckedChange={setShowHeader} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">Show service descriptions</p>
            <Switch checked={showServiceDescriptions} onCheckedChange={setShowServiceDescriptions} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">Show prices</p>
            <Switch checked={showPrices} onCheckedChange={setShowPrices} />
          </div>
        </CardContent>
      </Card>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </div>
  )
}
