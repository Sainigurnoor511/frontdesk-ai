'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { industries } from '@/lib/data/industries'
import {
  ChoiceTile,
  OnboardingShell,
  StepFooter,
  StepHeading,
} from '@/components/onboarding/onboarding-ui'

export function IndustryStep({
  initialIndustry,
  dots,
  nextLabel,
  submitting = false,
  onNext,
  onBack,
}: {
  initialIndustry?: string
  dots: { total: number; current: number }
  nextLabel: string
  submitting?: boolean
  onNext: (industry: string) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(initialIndustry ?? '')

  return (
    <OnboardingShell width="xl">
      <div className="space-y-8">
        <StepHeading
          title="What industry are you in?"
          description="We'll set up your booking system accordingly. You can change this anytime."
        />
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {industries.map((industry) => (
            <ChoiceTile
              key={industry.value}
              selected={selected === industry.value}
              onClick={() => setSelected(industry.value)}
              className="h-24 flex-col gap-2 px-2"
            >
              <industry.icon className="size-4" />
              {industry.label}
            </ChoiceTile>
          ))}
        </div>
        <StepFooter dots={dots}>
          <Button variant="ghost" size="lg" onClick={onBack} disabled={submitting}>
            Back
          </Button>
          <Button size="lg" disabled={!selected || submitting} onClick={() => onNext(selected)}>
            {submitting ? 'Setting up…' : nextLabel}
          </Button>
        </StepFooter>
      </div>
    </OnboardingShell>
  )
}
