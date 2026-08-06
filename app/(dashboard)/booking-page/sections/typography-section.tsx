'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { BookingSection, SettingsCard } from '../section-layout'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { updateTypography } from '../actions'
import { usePreviewDraft } from '../preview-draft-context'

const FONT_OPTIONS = ['system-ui', 'Georgia', 'Inter', 'Merriweather', 'Poppins'] as const

export function TypographySection({ config }: { config: BookingPageConfig }) {
  const { reportDraft } = usePreviewDraft()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [headingFont, setHeadingFont] = useState(config.headingFont)
  const [bodyFont, setBodyFont] = useState(config.bodyFont)
  const [headingSize, setHeadingSize] = useState(config.headingSize)
  const [bodySize, setBodySize] = useState(config.bodySize)
  const [fontWeight, setFontWeight] = useState(config.fontWeight)
  const [lineHeight, setLineHeight] = useState(config.lineHeight)
  const [letterSpacing, setLetterSpacing] = useState(config.letterSpacing)

  function setHeadingFontDraft(value: string) {
    setHeadingFont(value)
    reportDraft({ config: { headingFont: value } })
  }
  function setBodyFontDraft(value: string) {
    setBodyFont(value)
    reportDraft({ config: { bodyFont: value } })
  }
  function setHeadingSizeDraft(value: typeof headingSize) {
    setHeadingSize(value)
    reportDraft({ config: { headingSize: value } })
  }
  function setBodySizeDraft(value: typeof bodySize) {
    setBodySize(value)
    reportDraft({ config: { bodySize: value } })
  }
  function setFontWeightDraft(value: typeof fontWeight) {
    setFontWeight(value)
    reportDraft({ config: { fontWeight: value } })
  }
  function setLineHeightDraft(value: typeof lineHeight) {
    setLineHeight(value)
    reportDraft({ config: { lineHeight: value } })
  }
  function setLetterSpacingDraft(value: typeof letterSpacing) {
    setLetterSpacing(value)
    reportDraft({ config: { letterSpacing: value } })
  }

  const dirty =
    headingFont !== config.headingFont ||
    bodyFont !== config.bodyFont ||
    headingSize !== config.headingSize ||
    bodySize !== config.bodySize ||
    fontWeight !== config.fontWeight ||
    lineHeight !== config.lineHeight ||
    letterSpacing !== config.letterSpacing

  function handleSave() {
    setSaving(true)
    startTransition(async () => {
      const result = await updateTypography({
        headingFont,
        bodyFont,
        headingSize,
        bodySize,
        fontWeight,
        lineHeight,
        letterSpacing,
      })
      setSaving(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Typography saved.')
    })
  }

  function handleCancel() {
    setHeadingFont(config.headingFont)
    setBodyFont(config.bodyFont)
    setHeadingSize(config.headingSize)
    setBodySize(config.bodySize)
    setFontWeight(config.fontWeight)
    setLineHeight(config.lineHeight)
    setLetterSpacing(config.letterSpacing)
  }

  return (
    <BookingSection>
      <SettingsCard
        title="Typography"
        description="Fonts and text sizing for your public booking page."
        contentClassName="space-y-5 p-4"
      >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="heading-font">Heading font</Label>
              <Select value={headingFont} onValueChange={(value) => setHeadingFontDraft(value ?? headingFont)}>
                <SelectTrigger id="heading-font" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((font) => (
                    <SelectItem key={font} value={font}>
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="body-font">Body font</Label>
              <Select value={bodyFont} onValueChange={(value) => setBodyFontDraft(value ?? bodyFont)}>
                <SelectTrigger id="body-font" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((font) => (
                    <SelectItem key={font} value={font}>
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="heading-size">Heading size</Label>
              <Select value={headingSize} onValueChange={(v) => setHeadingSizeDraft(v as typeof headingSize)}>
                <SelectTrigger id="heading-size" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                  <SelectItem value="xl">Extra large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="body-size">Body size</Label>
              <Select value={bodySize} onValueChange={(v) => setBodySizeDraft(v as typeof bodySize)}>
                <SelectTrigger id="body-size" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="font-weight">Weight</Label>
              <Select value={fontWeight} onValueChange={(v) => setFontWeightDraft(v as typeof fontWeight)}>
                <SelectTrigger id="font-weight" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="semibold">Semibold</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="line-height">Line height</Label>
              <Select value={lineHeight} onValueChange={(v) => setLineHeightDraft(v as typeof lineHeight)}>
                <SelectTrigger id="line-height" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tight">Tight</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="relaxed">Relaxed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="letter-spacing">Letter spacing</Label>
              <Select
                value={letterSpacing}
                onValueChange={(v) => setLetterSpacingDraft(v as typeof letterSpacing)}
              >
                <SelectTrigger id="letter-spacing" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tight">Tight</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="wide">Wide</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
      </SettingsCard>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </BookingSection>
  )
}
