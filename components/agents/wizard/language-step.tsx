'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const LANGUAGES = ['English', 'Hindi']

export function LanguageStep({
  initialLanguage,
  onNext,
  onBack,
}: {
  initialLanguage?: string
  onNext: (language: string) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(initialLanguage ?? 'English')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">What language should your agent speak?</h1>
        <p className="text-muted-foreground">Your agent&apos;s greeting and replies will use this language.</p>
      </div>
      <div className="flex gap-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setSelected(lang)}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
              selected === lang ? 'border-primary bg-accent font-medium' : 'hover:bg-accent'
            }`}
          >
            {lang}
          </button>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => onNext(selected)}>Continue</Button>
      </div>
    </div>
  )
}
