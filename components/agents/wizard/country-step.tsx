'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { countries } from '@/lib/data/countries'

export function CountryStep({
  initialCountry,
  onNext,
  onBack,
}: {
  initialCountry?: string
  onNext: (country: string) => void
  onBack: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(initialCountry ?? '')

  const filtered = countries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Where is your business located?</h1>
        <p className="text-muted-foreground">This helps us set up the right phone numbers and regional settings.</p>
      </div>
      <Input placeholder="Search countries..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto">
        {filtered.map((country) => (
          <button
            key={country.code}
            type="button"
            onClick={() => setSelected(country.name)}
            className={`rounded-lg border p-3 text-left text-sm transition-colors ${
              selected === country.name ? 'border-primary bg-accent' : 'hover:bg-accent'
            }`}
          >
            {country.name}
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
