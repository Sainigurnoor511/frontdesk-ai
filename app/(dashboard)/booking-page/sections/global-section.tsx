'use client'

import { useState, useTransition } from 'react'
import { Code, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { EmbedDialog } from '../embed-dialog'
import { BookingSection, SettingsCard } from '../section-layout'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { updateGlobalBookingFlow, updateOrganizationSlug } from '../actions'
import { usePreviewDraft } from '../preview-draft-context'
import { getPublicBookingUrl, getPublicBookingPath } from '@/lib/public-booking-url'

export function GlobalSection({
  organizationSlug,
  organizationName,
  onSlugSaved,
  config,
}: {
  organizationSlug: string
  organizationName: string
  onSlugSaved: (slug: string) => void
  config: BookingPageConfig
}) {
  const { reportDraft } = usePreviewDraft()
  const [, startTransition] = useTransition()
  const [embedOpen, setEmbedOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [slug, setSlug] = useState(organizationSlug)
  const [slugInput, setSlugInput] = useState(organizationSlug)
  const [savingSlug, setSavingSlug] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [showStaffSelection, setShowStaffSelection] = useState(config.showStaffSelection)
  const [showReceptionist, setShowReceptionist] = useState(config.showReceptionistOnBookingPage)
  const [receptionistOnly, setReceptionistOnly] = useState(config.receptionistOnly)
  const [autoGreet, setAutoGreet] = useState(config.autoGreetOnLoad)
  const [showPhoneFallback, setShowPhoneFallback] = useState(config.showPhoneFallback)
  const [callWidgetPosition, setCallWidgetPosition] = useState(config.callWidgetPosition)

  function setShowReceptionistDraft(value: boolean) {
    setShowReceptionist(value)
    reportDraft({ config: { showReceptionistOnBookingPage: value } })
  }
  function setReceptionistOnlyDraft(value: boolean) {
    setReceptionistOnly(value)
    reportDraft({ config: { receptionistOnly: value } })
  }
  function setShowPhoneFallbackDraft(value: boolean) {
    setShowPhoneFallback(value)
    reportDraft({ config: { showPhoneFallback: value } })
  }
  function setCallWidgetPositionDraft(value: typeof callWidgetPosition) {
    setCallWidgetPosition(value)
    reportDraft({ config: { callWidgetPosition: value } })
  }

  const dirty =
    showStaffSelection !== config.showStaffSelection ||
    showReceptionist !== config.showReceptionistOnBookingPage ||
    receptionistOnly !== config.receptionistOnly ||
    autoGreet !== config.autoGreetOnLoad ||
    showPhoneFallback !== config.showPhoneFallback ||
    callWidgetPosition !== config.callWidgetPosition

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  function handleSaveSlug() {
    setSavingSlug(true)
    setSlugError(null)
    startTransition(async () => {
      const result = await updateOrganizationSlug({ slug: slugInput })
      setSavingSlug(false)
      if ('error' in result) {
        setSlugError(result.error)
        return
      }
      setSlug(result.slug)
      onSlugSaved(result.slug)
      toast.success('Booking page URL updated.')
    })
  }

  const slugDirty = slugInput !== slug

  function handleSave() {
    setSaving(true)
    startTransition(async () => {
      const result = await updateGlobalBookingFlow({
        showStaffSelection,
        showReceptionistOnBookingPage: showReceptionist,
        receptionistOnly,
        autoGreetOnLoad: autoGreet,
        showPhoneFallback,
        callWidgetPosition,
      })
      setSaving(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Global settings saved.')
    })
  }

  function handleCancel() {
    setShowStaffSelection(config.showStaffSelection)
    setShowReceptionist(config.showReceptionistOnBookingPage)
    setReceptionistOnly(config.receptionistOnly)
    setAutoGreet(config.autoGreetOnLoad)
    setShowPhoneFallback(config.showPhoneFallback)
    setCallWidgetPosition(config.callWidgetPosition)
  }

  return (
    <BookingSection>
      <SettingsCard
        title="Global settings"
        description="Your public booking link and how customers move through the booking process."
      >
          <div>
            <h3 className="text-sm font-semibold">Booking page URL</h3>
            <p className="text-sm text-muted-foreground">
              Share this link with clients so they can book appointments online.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking-slug">Slug</Label>
            <div className="flex items-center gap-2">
              <Input
                id="booking-slug"
                value={slugInput}
                onChange={(e) => {
                  setSlugInput(e.target.value.toLowerCase())
                  setSlugError(null)
                }}
                className="font-mono text-sm"
              />
              {slugDirty && (
                <Button type="button" size="sm" disabled={savingSlug} onClick={handleSaveSlug}>
                  {savingSlug ? 'Saving…' : 'Save'}
                </Button>
              )}
            </div>
            {slugError && <p className="text-sm text-destructive">{slugError}</p>}
          </div>

          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
            <p className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
              {getPublicBookingUrl(slug)}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Copy booking page URL"
              onClick={() => copyToClipboard(getPublicBookingUrl(slug), 'Link')}
            >
              <Copy className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open booking page in new tab"
              nativeButton={false}
              render={<a href={getPublicBookingPath(slug)} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="size-4" />
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full justify-between gap-2"
            onClick={() => setEmbedOpen(true)}
          >
            <span className="flex items-center gap-2">
              <Code className="size-4" />
              Embed on your website
            </span>
          </Button>

          <EmbedDialog
            open={embedOpen}
            onOpenChange={setEmbedOpen}
            organizationSlug={slug}
            organizationName={organizationName}
          />
      </SettingsCard>

      <SettingsCard
        title="Booking flow"
        description="How customers move through the booking process."
        contentClassName="space-y-5 p-4"
      >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Show staff member selection</p>
              <p className="text-sm text-muted-foreground">Show or hide the staff picker.</p>
            </div>
            <Switch checked={showStaffSelection} onCheckedChange={setShowStaffSelection} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Show receptionist on booking page</p>
              <p className="text-sm text-muted-foreground">
                AI receptionist column beside the booking flow.
              </p>
            </div>
            <Switch checked={showReceptionist} onCheckedChange={setShowReceptionistDraft} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Receptionist only</p>
              <p className="text-sm text-muted-foreground">
                Hide the booking flow and show only the receptionist.
              </p>
            </div>
            <Switch checked={receptionistOnly} onCheckedChange={setReceptionistOnlyDraft} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Auto-greet on page load</p>
              <p className="text-sm text-muted-foreground">
                Receptionist speaks automatically instead of waiting for a click.
              </p>
            </div>
            <Switch checked={autoGreet} onCheckedChange={setAutoGreet} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Show phone number fallback</p>
              <p className="text-sm text-muted-foreground">
                Display a direct phone number beside the call widget.
              </p>
            </div>
            <Switch checked={showPhoneFallback} onCheckedChange={setShowPhoneFallbackDraft} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="call-widget-position">Call widget position</Label>
            <Select
              value={callWidgetPosition}
              onValueChange={(value) => setCallWidgetPositionDraft(value as typeof callWidgetPosition)}
            >
              <SelectTrigger id="call-widget-position" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="bottom-left">Bottom left</SelectItem>
                <SelectItem value="bottom-right">Bottom right</SelectItem>
              </SelectContent>
            </Select>
          </div>
      </SettingsCard>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </BookingSection>
  )
}
