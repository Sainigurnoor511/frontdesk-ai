'use client'

import { useMemo, useState } from 'react'
import { Code, Copy, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { buildBookingEmbedSnippet, type EmbedPlatform } from '@/lib/booking-embed-snippet'
import { getPublicBookingUrl } from '@/lib/public-booking-url'

const PLATFORMS: { id: EmbedPlatform; label: string }[] = [
  { id: 'html', label: 'HTML' },
  { id: 'react', label: 'React' },
  { id: 'vue', label: 'Vue' },
  { id: 'angular', label: 'Angular' },
  { id: 'wordpress', label: 'WordPress' },
]

export function EmbedDialog({
  open,
  onOpenChange,
  organizationSlug,
  organizationName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationSlug: string
  organizationName: string
}) {
  const [platform, setPlatform] = useState<EmbedPlatform>('html')
  const [fullPage, setFullPage] = useState(false)
  const [height, setHeight] = useState('800')

  const bookingUrl = getPublicBookingUrl(organizationSlug)
  const parsedHeight = Math.max(200, Number.parseInt(height, 10) || 800)

  const snippet = useMemo(
    () =>
      buildBookingEmbedSnippet({
        url: bookingUrl,
        title: organizationName,
        height: parsedHeight,
        fullPage,
        platform,
      }),
    [bookingUrl, organizationName, parsedHeight, fullPage, platform]
  )

  function copySnippet() {
    navigator.clipboard.writeText(snippet)
    toast.success('Code copied')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl" showCloseButton>
        <DialogHeader className="border-0 px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-semibold">Embed on your website</DialogTitle>
          <DialogDescription>
            Paste this snippet into your website. It always shows your latest design, so you never
            have to update it.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 px-6">
          <Tabs value={platform} onValueChange={(value) => setPlatform(value as EmbedPlatform)}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList className="h-auto w-full justify-start gap-1 p-1 sm:w-auto">
                {PLATFORMS.map(({ id, label }) => (
                  <TabsTrigger key={id} value={id} className="px-3 py-1.5 text-xs sm:text-sm">
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="embed-full-page"
                    checked={fullPage}
                    onCheckedChange={(checked) => setFullPage(checked === true)}
                  />
                  <Label htmlFor="embed-full-page" className="text-sm font-medium">
                    Full page
                  </Label>
                  <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="embed-height" className="text-sm text-muted-foreground">
                    Height
                  </Label>
                  <Input
                    id="embed-height"
                    type="number"
                    min={200}
                    value={height}
                    disabled={fullPage}
                    onChange={(e) => setHeight(e.target.value)}
                    className="h-8 w-20"
                  />
                  <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
              </div>
            </div>

            {PLATFORMS.map(({ id }) => (
              <TabsContent key={id} value={id} className="mt-4 outline-none">
                <div className="relative rounded-lg bg-muted/60 p-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 size-8"
                    aria-label="Copy code"
                    onClick={copySnippet}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <pre
                    className={cn(
                      'min-h-36 overflow-x-auto pr-10 text-xs leading-relaxed whitespace-pre-wrap',
                      'font-mono text-foreground'
                    )}
                  >
                    <code>{snippet}</code>
                  </pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <p className="text-sm text-muted-foreground">
            Keep the <code className="text-foreground">allow=&quot;microphone&quot;</code> attribute
            — without it your receptionist cannot hear customers who call from the embedded page.
          </p>
        </DialogBody>

        <DialogFooter className="px-6">
          <Button type="button" className="gap-1.5" onClick={copySnippet}>
            <Code className="size-4" />
            Copy code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
