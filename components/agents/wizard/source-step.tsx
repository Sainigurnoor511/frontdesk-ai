'use client'

import { useState } from 'react'
import {
  Globe,
  SquarePen,
  Clock,
  Tag,
  CircleCheck,
  Store,
  FileText,
  ListOrdered,
  File,
  Zap,
  Radar,
  Timer,
  ScanSearch,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { scanRequestSchema, type ScanRequestInput } from '@/lib/validations/agent'
import {
  BulletList,
  PatternCard,
  OnboardingShell,
  StepHeading,
  type PatternName,
} from '@/components/onboarding/onboarding-ui'

type ScanDepth = ScanRequestInput['scanDepth']
type SourceView = 'menu' | 'scan-depth' | 'scan-url'

const DEPTH_OPTIONS: {
  value: ScanDepth
  label: string
  pattern: PatternName
  icon: typeof File
  bullets: string[]
}[] = [
  {
    value: 'single',
    label: 'Single page',
    pattern: 'wide',
    icon: File,
    bullets: [
      'Ready in under a minute',
      'Reads just the link you provide',
      'Ideal for a business profile or listing',
    ],
  },
  {
    value: 'quick',
    label: 'Quick scan',
    pattern: 'medium',
    icon: Zap,
    bullets: [
      'Ready in about a minute',
      'Scans a smart selection of your pages',
      'Great for most business websites',
    ],
  },
  {
    value: 'deep',
    label: 'Deep scan',
    pattern: 'fine',
    icon: Radar,
    bullets: [
      'Takes 4-5 minutes',
      'Systematically maps and reads your site',
      'Best for large, content-heavy sites',
    ],
  },
]

const DEPTH_BULLET_ICONS = [Timer, ScanSearch, Sparkles]

export function SourceStep({
  onScanStarted,
  onManual,
}: {
  onScanStarted: (input: ScanRequestInput) => Promise<void>
  onManual: () => void
}) {
  const [view, setView] = useState<SourceView>('menu')
  const [depth, setDepth] = useState<ScanDepth>('quick')
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (view === 'menu') {
    return (
      <OnboardingShell width="lg">
        <div className="space-y-8">
          <StepHeading
            title="Let's get your receptionist live"
            description="Drop a URL and we'll have it ready in about a minute. No website? Enter your details by hand instead."
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-6">
              <PatternCard
                pattern="medium"
                icon={Globe}
                label="Scan my website"
                onClick={() => setView('scan-depth')}
              />
              <BulletList
                items={[
                  { icon: Clock, text: 'Detect business hours and info' },
                  { icon: Tag, text: 'Pull services & pricing automatically' },
                  { icon: CircleCheck, text: 'Live agent in about a minute' },
                ]}
              />
            </div>
            <div className="space-y-6">
              <PatternCard
                pattern="fine"
                icon={SquarePen}
                label="Enter information manually"
                onClick={onManual}
              />
              <BulletList
                items={[
                  { icon: Store, text: 'Tell us about your business' },
                  { icon: FileText, text: 'Set hours, services and staff' },
                  { icon: ListOrdered, text: "We'll guide you step-by-step" },
                ]}
              />
            </div>
          </div>
        </div>
      </OnboardingShell>
    )
  }

  if (view === 'scan-depth') {
    return (
      <OnboardingShell width="2xl">
        <div className="space-y-8">
          <StepHeading
            title="How thoroughly should we scan?"
            description="Single page is ideal for profiles and listings. Quick scan picks a smart selection of your pages. Deep scan maps your site for the most complete results."
          />
          <div className="grid gap-6 md:grid-cols-3">
            {DEPTH_OPTIONS.map((option) => (
              <div key={option.value} className="space-y-6">
                <PatternCard
                  pattern={option.pattern}
                  icon={option.icon}
                  label={option.label}
                  onClick={() => {
                    setDepth(option.value)
                    setView('scan-url')
                  }}
                />
                <BulletList
                  items={option.bullets.map((text, index) => ({
                    icon: DEPTH_BULLET_ICONS[index],
                    text,
                  }))}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end border-t pt-6">
            <Button variant="ghost" size="lg" onClick={() => setView('menu')}>
              Back
            </Button>
          </div>
        </div>
      </OnboardingShell>
    )
  }

  async function submitUrl(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = url.trim()
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = scanRequestSchema.safeParse({ url: candidate, scanDepth: depth })
    if (!parsed.success) {
      setUrlError(parsed.error.issues[0].message)
      return
    }
    setUrlError(null)
    setSubmitting(true)
    await onScanStarted(parsed.data)
    setSubmitting(false)
  }

  return (
    <OnboardingShell width="sm" centered>
      <form onSubmit={submitUrl} className="space-y-8">
        <StepHeading
          title="We'll get your agent up and running in no time"
          description="Paste a link to your website or any other knowledge source"
        />
        <div className="space-y-2">
          <Input
            aria-label="Website URL"
            aria-invalid={Boolean(urlError)}
            autoFocus
            inputMode="url"
            autoComplete="url"
            placeholder="Enter your website URL..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="h-12 rounded-xl px-4 text-base"
          />
          {urlError && <p className="text-sm text-destructive">{urlError}</p>}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="lg" onClick={() => setView('scan-depth')}>
            Back
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onManual}>
            Skip
          </Button>
          <Button type="submit" size="lg" disabled={!url.trim() || submitting}>
            {submitting ? 'Starting…' : 'Continue'}
          </Button>
        </div>
      </form>
    </OnboardingShell>
  )
}
