'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { manualBusinessInfoSchema } from '@/lib/validations/agent'
import { OnboardingShell, StepFooter, StepHeading } from '@/components/onboarding/onboarding-ui'

export function BusinessNameStep({
  initialName,
  dots,
  submitting,
  onNext,
  onBack,
}: {
  initialName?: string
  dots: { total: number; current: number }
  submitting: boolean
  onNext: (businessName: string) => void
  onBack: () => void
}) {
  const [name, setName] = useState(initialName ?? '')
  const [error, setError] = useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = manualBusinessInfoSchema.safeParse({ businessName: name.trim() })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    onNext(parsed.data.businessName)
  }

  return (
    <OnboardingShell width="sm" centered>
      <form onSubmit={submit} className="space-y-8">
        <StepHeading
          title="What's your business called?"
          description="Your receptionist uses this name when it greets callers."
        />
        <div className="space-y-2">
          <Input
            aria-label="Business name"
            aria-invalid={Boolean(error)}
            autoFocus
            autoComplete="organization"
            placeholder="Enter your business name..."
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-12 rounded-xl px-4 text-base"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <StepFooter dots={dots}>
          <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={submitting}>
            Back
          </Button>
          <Button type="submit" size="lg" disabled={!name.trim() || submitting}>
            {submitting ? 'Setting up…' : 'Go to dashboard'}
          </Button>
        </StepFooter>
      </form>
    </OnboardingShell>
  )
}
