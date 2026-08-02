'use client'

import { useState, useTransition } from 'react'
import { ArrowUp, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { generateAdditionalInstructions } from '@/app/(dashboard)/agents/[id]/actions'

type InstructionsGeneratorPopoverProps = {
  businessName?: string | null
  industry?: string | null
  onGenerated: (text: string) => void
}

export function InstructionsGeneratorPopover({
  businessName,
  industry,
  onGenerated,
}: InstructionsGeneratorPopoverProps) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, startGenerating] = useTransition()

  function handleSubmit() {
    setError(null)
    startGenerating(async () => {
      const result = await generateAdditionalInstructions(prompt, { businessName, industry })
      if ('error' in result) {
        setError(result.error)
        return
      }
      onGenerated(result.text)
      setPrompt('')
      setOpen(false)
    })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Generate with AI"
          />
        }
      >
        <WandSparkles className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the type of agent you would like to configure..."
          rows={3}
          className="resize-none border-0 p-0 shadow-none focus-visible:ring-0"
          autoFocus
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="icon"
            className="size-8 rounded-full"
            disabled={!prompt.trim() || isGenerating}
            onClick={handleSubmit}
            aria-label="Generate"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
