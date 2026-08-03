'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { createClient } from '@/lib/supabase/client'
import type { BookingPageConfig } from '@/lib/data/booking-page-config'
import { updateMedia } from '../actions'

export function MediaSection({
  organizationId,
  config,
}: {
  organizationId: string
  config: BookingPageConfig
}) {
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(config.backgroundImageUrl)
  const [backgroundVideoUrl, setBackgroundVideoUrl] = useState(config.backgroundVideoUrl)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const dirty =
    backgroundImageUrl !== config.backgroundImageUrl || backgroundVideoUrl !== config.backgroundVideoUrl

  async function uploadFile(
    file: File,
    kind: 'background-image' | 'background-video',
    setUrl: (url: string) => void,
    setUploading: (uploading: boolean) => void
  ) {
    setUploading(true)
    const supabase = createClient()
    const path = `${organizationId}/${kind}-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('booking-page-media').upload(path, file, {
      upsert: true,
    })
    setUploading(false)

    if (error) {
      toast.error('Could not upload file. Please try again.')
      return
    }

    const { data } = supabase.storage.from('booking-page-media').getPublicUrl(path)
    setUrl(data.publicUrl)
  }

  function handleSave() {
    setSaving(true)
    startTransition(async () => {
      const result = await updateMedia({ backgroundImageUrl, backgroundVideoUrl })
      setSaving(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Media saved.')
    })
  }

  function handleCancel() {
    setBackgroundImageUrl(config.backgroundImageUrl)
    setBackgroundVideoUrl(config.backgroundVideoUrl)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Media</h2>
        <p className="text-sm text-muted-foreground">
          Background image or video shown behind the receptionist panel.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-4">
          <div className="space-y-2">
            <Label>Background image</Label>
            <div className="flex items-center gap-3">
              {backgroundImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={backgroundImageUrl}
                  alt="Background"
                  className="h-16 w-24 rounded-md border object-cover"
                />
              ) : (
                <div className="flex h-16 w-24 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                  None
                </div>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void uploadFile(file, 'background-image', setBackgroundImageUrl, setUploadingImage)
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploadingImage}
                onClick={() => imageInputRef.current?.click()}
              >
                {uploadingImage ? 'Uploading…' : 'Upload image'}
              </Button>
              {backgroundImageUrl && (
                <Button type="button" variant="ghost" onClick={() => setBackgroundImageUrl(null)}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Background video</Label>
            <div className="flex items-center gap-3">
              {backgroundVideoUrl ? (
                <p className="max-w-[220px] truncate text-xs text-muted-foreground">{backgroundVideoUrl}</p>
              ) : (
                <p className="text-xs text-muted-foreground">None</p>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void uploadFile(file, 'background-video', setBackgroundVideoUrl, setUploadingVideo)
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploadingVideo}
                onClick={() => videoInputRef.current?.click()}
              >
                {uploadingVideo ? 'Uploading…' : 'Upload video'}
              </Button>
              {backgroundVideoUrl && (
                <Button type="button" variant="ghost" onClick={() => setBackgroundVideoUrl(null)}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <UnsavedChangesBar show={dirty} saving={saving} onSave={handleSave} onCancel={handleCancel} />
    </div>
  )
}
