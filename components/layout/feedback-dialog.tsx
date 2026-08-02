'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { submitFeedback } from './feedback-actions'

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  function reset() {
    setMessage('')
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitFeedback({ issue: message.trim() || undefined })

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
          <DialogTitle>Help us make the product better</DialogTitle>
        </DialogHeader>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's on your mind?"
          className="min-h-28"
        />

        <div className="flex items-center justify-between pt-1">
          <a
            href="mailto:support@frontdesk.ai"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Or contact our support team directly
          </a>
          <Button disabled={!message.trim() || pending} onClick={handleSubmit}>
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
