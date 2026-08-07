'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    toast.error(error.message || 'We could not load this page. Please try again.')
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-sm text-muted-foreground">
        Something went wrong loading this page.
      </p>
      <Button size="sm" variant="outline" onClick={reset}>
        Retry
      </Button>
    </div>
  )
}
