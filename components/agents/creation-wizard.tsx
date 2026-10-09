'use client'

import { useCallback, useState } from 'react'
import { SourceStep } from './wizard/source-step'
import { ScanProgressStep } from './wizard/scan-progress-step'
import { CountryStep } from './wizard/country-step'
import { LanguageStep } from './wizard/language-step'
import { IndustryStep } from './wizard/industry-step'
import { BusinessNameStep } from './wizard/business-name-step'
import { startWebsiteScan, createAgent } from '@/app/onboarding/actions'
import type { ScanRequestInput, CreateAgentInput } from '@/lib/validations/agent'
import { industries } from '@/lib/data/industries'
import { toast } from 'sonner'

type WizardStep = 'source' | 'scanning' | 'country' | 'language' | 'industry' | 'name'

type Draft = Partial<Pick<CreateAgentInput, 'businessName' | 'country' | 'language' | 'industry'>>

const DEFAULT_MAX_RING_SECONDS = 20

export function CreationWizard() {
  const [step, setStep] = useState<WizardStep>('source')
  const [scanJobId, setScanJobId] = useState<string | null>(null)
  const [data, setData] = useState<Draft>({})
  const [submitting, setSubmitting] = useState(false)

  const needsName = !data.businessName
  const totalSteps = needsName || step === 'name' ? 4 : 3

  async function handleScanStart(input: ScanRequestInput) {
    const result = await startWebsiteScan(input)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setScanJobId(result.scanJobId)
    setStep('scanning')
  }

  const handleScanComplete = useCallback(
    (extracted: { businessName: string | null; suggestedIndustry: string | null }) => {
      const knownIndustry = industries.find((item) => item.value === extracted.suggestedIndustry)
      setData((previous) => ({
        ...previous,
        businessName: extracted.businessName ?? previous.businessName,
        industry: knownIndustry?.value ?? previous.industry,
      }))
      setStep('country')
    },
    []
  )

  async function finish(draft: Draft) {
    setSubmitting(true)
    const result = await createAgent({
      businessName: draft.businessName ?? '',
      country: draft.country ?? '',
      language: draft.language ?? '',
      industry: draft.industry ?? '',
      answeringMode: 'agent_first',
      maxRingSeconds: DEFAULT_MAX_RING_SECONDS,
    })
    if (result?.error) {
      toast.error(result.error)
      setSubmitting(false)
    }
  }

  switch (step) {
    case 'source':
      return (
        <SourceStep
          onScanStarted={handleScanStart}
          onManual={() => {
            setData((previous) => ({ ...previous, businessName: undefined }))
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
          dots={{ total: totalSteps, current: 0 }}
          onNext={(country) => {
            setData((previous) => ({ ...previous, country }))
            setStep('language')
          }}
          onBack={() => setStep('source')}
        />
      )
    case 'language':
      return (
        <LanguageStep
          initialLanguage={data.language}
          dots={{ total: totalSteps, current: 1 }}
          onNext={(language) => {
            setData((previous) => ({ ...previous, language }))
            setStep('industry')
          }}
          onBack={() => setStep('country')}
        />
      )
    case 'industry':
      return (
        <IndustryStep
          initialIndustry={data.industry}
          dots={{ total: totalSteps, current: 2 }}
          nextLabel={needsName ? 'Continue' : 'Go to dashboard'}
          submitting={submitting}
          onNext={(industry) => {
            const next = { ...data, industry }
            setData(next)
            if (needsName) {
              setStep('name')
              return
            }
            void finish(next)
          }}
          onBack={() => setStep('language')}
        />
      )
    case 'name':
      return (
        <BusinessNameStep
          initialName={data.businessName}
          dots={{ total: 4, current: 3 }}
          submitting={submitting}
          onNext={(businessName) => void finish({ ...data, businessName })}
          onBack={() => setStep('industry')}
        />
      )
  }
}
