'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ChoiceTile,
  OnboardingShell,
  StepFooter,
  StepHeading,
} from '@/components/onboarding/onboarding-ui'

const LANGUAGES = ['English', 'Hindi']

export function LanguageStep({
  initialLanguage,
  dots,
  onNext,
  onBack,
}: {
  initialLanguage?: string
  dots: { total: number; current: number }
  onNext: (language: string) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(initialLanguage ?? 'English')

  return (
    <OnboardingShell width="md" centered>
      <div className="space-y-8">
        <StepHeading
          title="What language should your agent speak?"
          description="Your agent's greeting and replies will use this language. You can change it later."
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {LANGUAGES.map((language) => (
            <ChoiceTile
              key={language}
              selected={selected === language}
              onClick={() => setSelected(language)}
              className="h-16"
            >
              {language}
            </ChoiceTile>
          ))}
        </div>
        <StepFooter dots={dots}>
          <Button variant="ghost" size="lg" onClick={onBack}>
            Back
          </Button>
          <Button size="lg" onClick={() => onNext(selected)}>
            Continue
          </Button>
        </StepFooter>
      </div>
    </OnboardingShell>
  )
}
