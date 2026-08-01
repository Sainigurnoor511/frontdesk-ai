'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { industries } from '@/lib/data/industries'

export function IndustryStep({
  initialIndustry,
  onNext,
  onBack,
}: {
  initialIndustry?: string
  onNext: (industry: string) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(initialIndustry ?? '')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">What industry are you in?</h1>
        <p className="text-muted-foreground">We&apos;ll set up your booking system accordingly.</p>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {industries.map((industry) => (
          <button
            key={industry.value}
            type="button"
            onClick={() => setSelected(industry.value)}
            className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors ${
              selected === industry.value ? 'border-primary bg-accent' : 'hover:bg-accent'
            }`}
          >
            <industry.icon className="size-6" />
            {industry.label}
          </button>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!selected} onClick={() => onNext(selected)}>
          Continue
        </Button>
      </div>
    </div>
  )
}
