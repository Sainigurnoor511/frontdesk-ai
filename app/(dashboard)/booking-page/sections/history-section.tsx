'use client'

import { useEffect, useState, useTransition } from 'react'
import { History } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SkeletonVersionList } from '@/components/layout/dashboard-skeletons'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { BookingSection, SettingsCard } from '../section-layout'
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
    <BookingSection>
      <SettingsCard
        title="History"
        description="Every save creates a snapshot. Restore a previous version if something goes wrong."
        contentClassName="p-0"
      >
        {versions === null && <SkeletonVersionList rows={3} />}
        {versions?.length === 0 && (
          <Empty className="border-0 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History />
              </EmptyMedia>
              <EmptyTitle>No saved versions yet</EmptyTitle>
              <EmptyDescription>
                Snapshots are created each time you save booking page settings.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
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
      </SettingsCard>
    </BookingSection>
  )
}
