'use client'

import { useState } from 'react'
import { IntroSequence } from '@/components/onboarding/intro-sequence'
import { CreationWizard } from '@/components/agents/creation-wizard'

export default function OnboardingPage() {
  const [introDone, setIntroDone] = useState(false)

  return (
    <>
      {!introDone && <IntroSequence onFinish={() => setIntroDone(true)} />}
      {introDone && (
        <div className="mx-auto max-w-2xl px-4 py-16">
          <CreationWizard />
        </div>
      )}
    </>
  )
}
