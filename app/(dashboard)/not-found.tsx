import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

/**
 * 404 for signed-in pages. Renders inside the dashboard layout, so the sidebar
 * and header stay put and the user can navigate onward instead of hitting a
 * dead end.
 *
 * Catches `notFound()` from any route in this group — a deleted agent id, a
 * conversation belonging to another org, and so on.
 *
 * Worth knowing when debugging: several data helpers in `lib/data/*` discard the
 * Supabase `error` and return null on failure, so an infrastructure problem (a
 * pending migration, a missing column grant) can surface here as a 404 rather
 * than an error. If this page appears somewhere it obviously shouldn't, check
 * the server logs for a swallowed query error before assuming the record is
 * genuinely missing.
 */
export default function DashboardNotFound() {
  return (
    <Empty className="flex-1 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestion />
        </EmptyMedia>
        <EmptyTitle>We couldn&apos;t find that page</EmptyTitle>
        <EmptyDescription>
          It may have been deleted, or the link might be pointing somewhere that no longer
          exists.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {/* `nativeButton={false}` is required whenever `render` is an anchor: Base
            UI otherwise expects a real <button> and warns that native button
            semantics are being dropped. */}
        <Button render={<Link href="/" />} nativeButton={false} size="sm" variant="outline">
          Back to dashboard
        </Button>
      </EmptyContent>
    </Empty>
  )
}
