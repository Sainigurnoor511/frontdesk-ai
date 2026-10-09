'use client'

import { useState } from 'react'
import { IntroSequence } from '@/components/onboarding/intro-sequence'
import { CreationWizard } from '@/components/agents/creation-wizard'

export function OnboardingClient() {
  const [introDone, setIntroDone] = useState(false)

  if (!introDone) {
    return <IntroSequence onFinish={() => setIntroDone(true)} />
  }

  return <CreationWizard />
}
