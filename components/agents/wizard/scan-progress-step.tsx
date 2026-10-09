'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { getScanJobStatus } from '@/app/onboarding/actions'
import type { ExtractedBusinessInfo } from '@/lib/providers/llm/types'
import { OnboardingShell } from '@/components/onboarding/onboarding-ui'

const SLIDES = [
  {
    image: '/images/receptionists.png',
    title: 'A receptionist that sounds like you',
    description: 'Pick a voice, set the tone, and add rules for how calls are handled.',
  },
  {
    image: '/images/calendar.png',
    title: 'Bookings straight into your calendar',
    description: 'Callers hear real availability and leave with a confirmed appointment.',
  },
  {
    image: '/images/call-dialog.png',
    title: 'Every call, written down',
    description: 'Transcripts, recordings and summaries for each conversation.',
  },
]

const SLIDE_INTERVAL_MS = 5000
const STATUS_LABELS = {
  pending: 'Starting the scan...',
  running: 'Reading website content...',
  completed: 'Finishing up...',
  failed: '',
}

export function ScanProgressStep({
  scanJobId,
  onComplete,
  onSkip,
}: {
  scanJobId: string
  onComplete: (data: ExtractedBusinessInfo) => void
  onSkip: () => void
}) {
  const [status, setStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      const result = await getScanJobStatus(scanJobId)
      if (cancelled) return

      if ('error' in result) {
        setStatus('failed')
        setErrorMessage(result.error)
        return
      }

      setStatus(result.status as typeof status)

      if (result.status === 'completed' && result.extractedData) {
        onComplete(result.extractedData)
        return
      }

      if (result.status === 'failed') {
        setErrorMessage(result.errorMessage ?? 'Scan failed.')
        return
      }

      timer = setTimeout(poll, 2000)
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [scanJobId, onComplete])

  useEffect(() => {
    const interval = setInterval(
      () => setSlide((current) => (current + 1) % SLIDES.length),
      SLIDE_INTERVAL_MS
    )
    return () => clearInterval(interval)
  }, [])

  if (status === 'failed') {
    return (
      <OnboardingShell width="sm" centered>
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t read that site</h1>
          <p className="text-base text-muted-foreground">{errorMessage}</p>
          <Button size="lg" onClick={onSkip}>
            Enter information manually
          </Button>
        </div>
      </OnboardingShell>
    )
  }

  const current = SLIDES[slide]

  return (
    <OnboardingShell width="md">
      <div className="-mt-8 space-y-8 md:-mt-14">
        <div className="rounded-2xl bg-muted p-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-background">
            {SLIDES.map((item, index) => (
              <Image
                key={item.image}
                src={item.image}
                alt=""
                fill
                sizes="600px"
                priority={index === 0}
                className={`object-cover object-left-top transition-opacity duration-700 ${
                  index === slide ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ))}
          </div>
        </div>
        <div className="space-y-2 text-center" aria-live="polite">
          <h1 className="text-xl font-semibold tracking-tight">{current.title}</h1>
          <p className="mx-auto max-w-md text-lg text-muted-foreground">{current.description}</p>
        </div>
        <div className="space-y-2" role="status">
          <p className="text-base font-medium">{STATUS_LABELS[status]}</p>
          <div className="flex justify-between" aria-hidden="true">
            {Array.from({ length: 40 }, (_, index) => (
              <span
                key={index}
                className="dot-chase size-1.5 rounded-full bg-border"
                style={{ animationDelay: `${index * 35}ms` }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="lg" onClick={onSkip}>
            Back
          </Button>
        </div>
      </div>
    </OnboardingShell>
  )
}
