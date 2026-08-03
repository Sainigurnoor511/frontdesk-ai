'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { createClient } from '@/lib/supabase/client'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { updateBranding } from '../actions'

export function BrandingSection({
  organizationId,
  config,
}: {
  organizationId: string
  config: BookingPageConfig
}) {
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState(config.logoUrl)
  const [tagline, setTagline] = useState(config.tagline ?? '')
  const [businessDescription, setBusinessDescription] = useState(config.businessDescription ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Branding</h2>
        <p className="text-sm text-muted-foreground">Your logo and business identity.</p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-4">
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
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Book an appointment or talk to our receptionist."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business-description">Business description</Label>
            <Textarea
              id="business-description"
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </div>
  )
}
