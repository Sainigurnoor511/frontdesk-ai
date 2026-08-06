'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { BookingSection, SettingsCard } from '../section-layout'
import { createClient } from '@/lib/supabase/client'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { updateBranding } from '../actions'
import { usePreviewDraft } from '../preview-draft-context'

export function BrandingSection({
  organizationId,
  config,
}: {
  organizationId: string
  config: BookingPageConfig
}) {
  const { reportDraft } = usePreviewDraft()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState(config.logoUrl)
  const [tagline, setTagline] = useState(config.tagline ?? '')
  const [businessDescription, setBusinessDescription] = useState(config.businessDescription ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function setTaglineDraft(value: string) {
    setTagline(value)
    reportDraft({ config: { tagline: value.trim() || null } })
  }
  function setBusinessDescriptionDraft(value: string) {
    setBusinessDescription(value)
    reportDraft({ config: { businessDescription: value.trim() || null } })
  }

  const dirty =
    logoUrl !== config.logoUrl ||
    tagline !== (config.tagline ?? '') ||
    businessDescription !== (config.businessDescription ?? '')

  async function handleLogoUpload(file: File) {
    setUploading(true)
    const supabase = createClient()
    const path = `${organizationId}/logo-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('booking-page-media').upload(path, file, {
      upsert: true,
    })
    setUploading(false)

    if (error) {
      toast.error('Could not upload logo. Please try again.')
      return
    }

    const { data } = supabase.storage.from('booking-page-media').getPublicUrl(path)
    setLogoUrl(data.publicUrl)
    reportDraft({ config: { logoUrl: data.publicUrl } })
  }

  function handleSave() {
    setSaving(true)
    startTransition(async () => {
      const result = await updateBranding({
        logoUrl,
        tagline: tagline.trim() || null,
        businessDescription: businessDescription.trim() || null,
      })
      setSaving(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Branding saved.')
    })
  }

  function handleCancel() {
    setLogoUrl(config.logoUrl)
    setTagline(config.tagline ?? '')
    setBusinessDescription(config.businessDescription ?? '')
  }

  return (
    <BookingSection>
      <SettingsCard title="Branding" description="Your logo and business identity." contentClassName="space-y-5 p-4">
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="size-16 rounded-md border object-contain" />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                  No logo
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleLogoUpload(file)
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Upload logo'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTaglineDraft(e.target.value)}
              placeholder="Book an appointment or talk to our receptionist."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business-description">Business description</Label>
            <Textarea
              id="business-description"
              value={businessDescription}
              onChange={(e) => setBusinessDescriptionDraft(e.target.value)}
              rows={4}
            />
          </div>
      </SettingsCard>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </BookingSection>
  )
}
