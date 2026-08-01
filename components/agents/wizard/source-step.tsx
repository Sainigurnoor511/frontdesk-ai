'use client'

import { useState } from 'react'
import { Globe, PencilSimple, Lightning, Target, FileText } from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { scanRequestSchema, type ScanRequestInput } from '@/lib/validations/agent'

type SourceChoice = 'menu' | 'scan-url' | 'scan-depth'

export function SourceStep({
  onScanStarted,
  onManual,
}: {
  onScanStarted: (input: ScanRequestInput) => void
  onManual: () => void
}) {
  const [choice, setChoice] = useState<SourceChoice>('menu')
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  if (choice === 'menu') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Let&apos;s get your receptionist live</h1>
          <p className="text-muted-foreground">
            Drop a URL and we&apos;ll have it ready in less than one minute, or enter details manually.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={() => setChoice('scan-url')}
          >
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <Globe className="size-8" />
              <p className="font-medium">Scan my website</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer transition-colors hover:bg-accent" onClick={onManual}>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <PencilSimple className="size-8" />
              <p className="font-medium">Enter information manually</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (choice === 'scan-url') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">We&apos;ll get your agent up and running!</h1>
          <p className="text-muted-foreground">Paste a link to your website or any other knowledge source</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="website-url">Website URL</Label>
          <Input
            id="website-url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {urlError && <p className="text-sm text-destructive">{urlError}</p>}
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onManual}>
            Skip
          </Button>
          <Button
            onClick={() => {
              const parsed = scanRequestSchema.safeParse({ url, scanDepth: 'single' })
              if (!parsed.success) {
                setUrlError(parsed.error.issues[0].message)
                return
              }
              setChoice('scan-depth')
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    )
  }

  const depthOptions: { value: 'single' | 'quick' | 'deep'; label: string; description: string; icon: typeof FileText }[] = [
    { value: 'single', label: 'Single page', description: 'Ideal for a business profile or listing', icon: FileText },
    { value: 'quick', label: 'Quick scan', description: 'Scans a smart selection of your pages', icon: Lightning },
    { value: 'deep', label: 'Deep scan', description: 'Systematically maps and reads your site', icon: Target },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">How thoroughly should we scan?</h1>
        <p className="text-muted-foreground">
          Single page is ideal for profiles. Quick scan picks a smart selection. Deep scan maps your
          whole site.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {depthOptions.map((option) => (
          <Card
            key={option.value}
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={() => onScanStarted({ url, scanDepth: option.value })}
          >
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <option.icon className="size-8" />
              <p className="font-medium">{option.label}</p>
              <p className="text-xs text-muted-foreground">{option.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button variant="ghost" onClick={() => setChoice('scan-url')}>
        Back
      </Button>
    </div>
  )
}
