'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { countries } from '@/lib/data/countries'
import { flagUrl } from '@/lib/flags'
import {
  ChoiceTile,
  OnboardingShell,
  StepFooter,
  StepHeading,
} from '@/components/onboarding/onboarding-ui'

export function CountryStep({
  initialCountry,
  dots,
  onNext,
  onBack,
}: {
  initialCountry?: string
  dots: { total: number; current: number }
  onNext: (country: string) => void
  onBack: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(initialCountry ?? '')

  const filtered = countries.filter((country) =>
    country.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <OnboardingShell width="xl">
      <div className="space-y-8">
        <StepHeading
          title="Where is your business located?"
          description="This helps us set up the right phone numbers and regional settings."
        />
        <Input
          aria-label="Search countries"
          placeholder="Search countries..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 rounded-lg px-3 text-sm"
        />
        <div className="scrollbar-thin -mx-1 grid max-h-[392px] grid-cols-2 gap-2.5 overflow-y-auto p-1 sm:grid-cols-4">
          {filtered.map((country) => (
            <ChoiceTile
              key={country.code}
              selected={selected === country.name}
              onClick={() => setSelected(country.name)}
              className="h-16 px-3"
            >
              <Image
                src={flagUrl(country.code)}
                alt=""
                width={20}
                height={20}
                className="size-5 shrink-0"
                unoptimized
              />
              <span className="truncate">{country.name}</span>
            </ChoiceTile>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No country matches that search.
            </p>
          )}
        </div>
        <StepFooter dots={dots}>
          <Button variant="ghost" size="lg" onClick={onBack}>
            Back
          </Button>
          <Button size="lg" disabled={!selected} onClick={() => onNext(selected)}>
            Continue
          </Button>
        </StepFooter>
      </div>
    </OnboardingShell>
  )
}
