'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Code, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { updateGlobalBookingFlow } from '../actions'
import { usePreviewDraft } from '../preview-draft-context'

export function GlobalSection({
  bookingUrl,
  embedSnippet,
  config,
}: {
  bookingUrl: string
  embedSnippet: string
  config: BookingPageConfig
}) {
  const { reportDraft } = usePreviewDraft()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Global settings</h2>
        <p className="text-sm text-muted-foreground">
          Your public booking link and how customers move through the booking process.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="text-sm font-semibold">Booking page URL</h3>
            <p className="text-sm text-muted-foreground">
              Share this link with clients so they can book appointments online.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input value={bookingUrl} readOnly className="font-mono text-sm" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(`https://${bookingUrl}`, 'Link')}
            >
              <Copy className="size-4" />
            </Button>
          </div>

          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium">
              <span className="flex items-center gap-2">
                <Code className="size-4" />
                Embed on your website
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-3">
              <p className="text-sm text-muted-foreground">
                Paste this snippet into your website&apos;s HTML to embed the booking page.
              </p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  <code>{embedSnippet}</code>
                </pre>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(embedSnippet, 'Snippet')}
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-4">
          <div>
            <h3 className="text-sm font-semibold">Booking flow</h3>
            <p className="text-sm text-muted-foreground">How customers move through the booking process.</p>
          </div>

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
        </CardContent>
      </Card>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </div>
  )
}
