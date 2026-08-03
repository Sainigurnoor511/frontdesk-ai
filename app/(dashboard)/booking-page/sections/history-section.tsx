'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  getBookingPageConfigVersions,
  restoreBookingPageConfigVersion,
  type BookingPageConfigVersion,
} from '../actions'

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function HistorySection() {
  const [, startTransition] = useTransition()
  const [versions, setVersions] = useState<BookingPageConfigVersion[] | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    void getBookingPageConfigVersions().then((result) => {
      if ('error' in result) {
        toast.error(result.error)
        setVersions([])
        return
      }
      setVersions(result.versions)
    })
  }, [])

  function handleRestore(versionId: string) {
    setRestoringId(versionId)
    startTransition(async () => {
      const result = await restoreBookingPageConfigVersion({ versionId })
      setRestoringId(null)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Restored. Reload the page to see the change reflected in each section.')
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">History</h2>
        <p className="text-sm text-muted-foreground">
          Every save creates a snapshot. Restore a previous version if something goes wrong.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {versions === null && (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          )}
          {versions?.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No saved versions yet.</p>
          )}
          {versions && versions.length > 0 && (
            <ul className="divide-y">
              {versions.map((version) => (
                <li key={version.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <p className="text-sm">{formatTimestamp(version.createdAt)}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={restoringId === version.id}
                    onClick={() => handleRestore(version.id)}
                  >
                    {restoringId === version.id ? 'Restoring…' : 'Restore'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
