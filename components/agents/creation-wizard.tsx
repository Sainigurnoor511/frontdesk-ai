'use client'

import { useState } from 'react'
import { SourceStep } from './wizard/source-step'
import { ScanProgressStep } from './wizard/scan-progress-step'
import { CountryStep } from './wizard/country-step'
import { LanguageStep } from './wizard/language-step'
import { IndustryStep } from './wizard/industry-step'
import { CallRoutingStep } from './wizard/call-routing-step'
import { startWebsiteScan, createAgent } from '@/app/onboarding/actions'
import type { ScanRequestInput, CreateAgentInput } from '@/lib/validations/agent'
import type { CallRoutingInput } from '@/lib/validations/agent'
import { toast } from 'sonner'

type WizardStep = 'source' | 'scanning' | 'country' | 'language' | 'industry' | 'routing'

export function CreationWizard() {
  const [step, setStep] = useState<WizardStep>('source')
  const [scanJobId, setScanJobId] = useState<string | null>(null)
  const [data, setData] = useState<Partial<CreateAgentInput>>({})

  async function handleScanStart(input: ScanRequestInput) {
    const result = await startWebsiteScan(input)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setScanJobId(result.scanJobId)
    setStep('scanning')
  }

  function handleScanComplete(extracted: { businessName: string | null; suggestedIndustry: string | null }) {
    setData((prev) => ({
      ...prev,
      businessName: extracted.businessName ?? prev.businessName,
      industry: extracted.suggestedIndustry ?? prev.industry,
    }))
    setStep('country')
  }

  async function handleFinish(routing: CallRoutingInput) {
    const finalData = { ...data, ...routing } as CreateAgentInput
    const result = await createAgent(finalData)
    if (result?.error) {
      toast.error(result.error)
    }
  }

  switch (step) {
    case 'source':
      return (
        <SourceStep
          onScanStarted={handleScanStart}
          onManual={(businessName) => {
            setData((prev) => ({ ...prev, businessName }))
            setStep('country')
          }}
        />
      )
    case 'scanning':
      return (
        <ScanProgressStep
          scanJobId={scanJobId!}
          onComplete={handleScanComplete}
          onSkip={() => setStep('source')}
        />
      )
    case 'country':
      return (
        <CountryStep
          initialCountry={data.country}
          onNext={(country) => {
            setData((prev) => ({ ...prev, country }))
            setStep('language')
          }}
          onBack={() => setStep('source')}
        />
      )
    case 'language':
      return (
        <LanguageStep
          initialLanguage={data.language}
          onNext={(language) => {
            setData((prev) => ({ ...prev, language }))
            setStep('industry')
          }}
          onBack={() => setStep('country')}
        />
      )
    case 'industry':
      return (
        <IndustryStep
          initialIndustry={data.industry}
          onNext={(industry) => {
            setData((prev) => ({ ...prev, industry }))
            setStep('routing')
          }}
          onBack={() => setStep('language')}
        />
      )
    case 'routing':
      return (
        <CallRoutingStep
          initialData={data}
          onNext={handleFinish}
          onBack={() => setStep('industry')}
        />
      )
  }
}
