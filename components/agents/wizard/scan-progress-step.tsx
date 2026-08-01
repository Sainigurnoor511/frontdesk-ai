'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { getScanJobStatus } from '@/app/(dashboard)/agents/actions'
import type { ExtractedBusinessInfo } from '@/lib/providers/llm/types'

export function ScanProgressStep({
  scanJobId,
  onComplete,
  onSkip,
}: {
  scanJobId: string
  onComplete: (data: ExtractedBusinessInfo) => void
  onSkip: () => void
}) {
  const [status, setStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      const result = await getScanJobStatus(scanJobId)
      if (cancelled) return

      if ('error' in result) {
        setStatus('failed')
        setErrorMessage(result.error)
        return
      }

      setStatus(result.status as typeof status)

      if (result.status === 'completed' && result.extractedData) {
        onComplete(result.extractedData)
        return
      }

      if (result.status === 'failed') {
        setErrorMessage(result.errorMessage ?? 'Scan failed.')
        return
      }

      setTimeout(poll, 2000)
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [scanJobId, onComplete])

  if (status === 'failed') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Scan failed</h1>
        <p className="text-sm text-destructive">{errorMessage}</p>
        <Button onClick={onSkip}>Enter information manually instead</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reading website content...</h1>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <Button variant="ghost" onClick={onSkip}>
        Skip and enter manually
      </Button>
    </div>
  )
}
