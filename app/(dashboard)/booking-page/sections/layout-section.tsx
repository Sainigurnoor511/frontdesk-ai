'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { BookingSection, SettingsCard } from '../section-layout'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { updateLayout } from '../actions'
import { usePreviewDraft } from '../preview-draft-context'

export function LayoutSection({ config }: { config: BookingPageConfig }) {
  const { reportDraft } = usePreviewDraft()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [receptionistPosition, setReceptionistPosition] = useState(config.receptionistPosition)
  const [showHeader, setShowHeader] = useState(config.showHeader)
  const [showServiceDescriptions, setShowServiceDescriptions] = useState(config.showServiceDescriptions)
  const [showPrices, setShowPrices] = useState(config.showPrices)

  function setReceptionistPositionDraft(value: typeof receptionistPosition) {
    setReceptionistPosition(value)
    reportDraft({ config: { receptionistPosition: value } })
  }
  function setShowHeaderDraft(value: boolean) {
    setShowHeader(value)
    reportDraft({ config: { showHeader: value } })
  }
  function setShowServiceDescriptionsDraft(value: boolean) {
    setShowServiceDescriptions(value)
    reportDraft({ config: { showServiceDescriptions: value } })
  }
  function setShowPricesDraft(value: boolean) {
    setShowPrices(value)
    reportDraft({ config: { showPrices: value } })
  }

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
    <BookingSection>
      <SettingsCard
        title="Layout"
        description="How the public booking page is structured."
        contentClassName="space-y-5 p-4"
      >
          <div className="space-y-2">
            <span className="text-sm font-medium">Receptionist panel position</span>
            <div className="flex items-center gap-2">
              {(['left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setReceptionistPositionDraft(side)}
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
            <div>
              <p className="text-sm font-medium">Show header</p>
              <p className="text-sm text-muted-foreground">Business name and branding at the top of the page.</p>
            </div>
            <Switch checked={showHeader} onCheckedChange={setShowHeaderDraft} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Show service descriptions</p>
              <p className="text-sm text-muted-foreground">Display description text under each service.</p>
            </div>
            <Switch checked={showServiceDescriptions} onCheckedChange={setShowServiceDescriptionsDraft} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Show prices</p>
              <p className="text-sm text-muted-foreground">Display service prices on the booking page.</p>
            </div>
            <Switch checked={showPrices} onCheckedChange={setShowPricesDraft} />
          </div>
      </SettingsCard>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </BookingSection>
  )
}
