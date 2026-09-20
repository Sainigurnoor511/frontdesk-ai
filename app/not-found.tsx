import Link from 'next/link'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Global 404. Catches unmatched URLs and any `notFound()` that has no closer
 * boundary — for example on the marketing/auth surfaces, or for a signed-out
 * visitor following a stale link.
 *
 * Deliberately standalone: it renders inside the root layout only, with no
 * sidebar or header, because at this level there may be no authenticated
 * session to build that chrome from. In-app 404s are handled by the
 * dashboard-scoped boundary instead, which keeps the navigation.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-lg bg-muted text-foreground">
        <Compass className="size-5" strokeWidth={1.5} />
      </div>

      <div className="flex max-w-md flex-col items-center gap-2">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          This page doesn&apos;t exist
        </h1>
        <p className="text-sm/relaxed text-muted-foreground">
          The link may be broken, or the page may have been moved or renamed.
        </p>
      </div>

      {/* Neutral label on purpose: `/` is the dashboard root, which redirects to
          /login when there's no session, and this boundary is reachable either
          signed in or out. */}
      <Button render={<Link href="/" />} nativeButton={false} size="sm">
        Take me home
      </Button>
    </main>
  )
}
