'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Star } from '@phosphor-icons/react/dist/ssr'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { submitFeedback } from './feedback-actions'

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [issue, setIssue] = useState('')
  const [featureRequest, setFeatureRequest] = useState('')
  const [pending, startTransition] = useTransition()

  const canSubmit = rating > 0 || issue.trim().length > 0 || featureRequest.trim().length > 0

  function reset() {
    setRating(0)
    setHoverRating(0)
    setIssue('')
    setFeatureRequest('')
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitFeedback({
        rating: rating > 0 ? rating : undefined,
        issue: issue.trim() || undefined,
        featureRequest: featureRequest.trim() || undefined,
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Thanks for the feedback!')
      reset()
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Quick feedback</DialogTitle>
          <DialogDescription>Help us improve</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-2 py-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Rate ${star} of 5`}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className={cn(
                'flex size-9 items-center justify-center rounded-lg border transition-colors',
                (hoverRating || rating) >= star
                  ? 'border-foreground'
                  : 'border-border hover:bg-muted'
              )}
            >
              <Star
                weight={(hoverRating || rating) >= star ? 'fill' : 'regular'}
                className="size-4 text-muted-foreground"
              />
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Ran into an issue?</p>
          <Textarea
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder="Describe what happened so we can fix it..."
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Missing something? We&apos;ll build it.</p>
          <Textarea
            value={featureRequest}
            onChange={(e) => setFeatureRequest(e.target.value)}
            placeholder="Tell us what you'd like to see next..."
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            className="text-sm font-medium text-foreground hover:underline"
            onClick={() => onOpenChange(false)}
          >
            Remind me later
          </button>
          <Button disabled={!canSubmit || pending} onClick={handleSubmit}>
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
