'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PlayCircle, Phone, X } from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function HomeClient() {
  const [dismissed, setDismissed] = useState(false)

  return (
    <div className="space-y-6">
      {!dismissed && (
        <Card className="relative">
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
          >
            <X />
          </Button>
          <CardContent className="space-y-3 py-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Getting started
            </p>
            <h2 className="text-lg font-semibold">Learn the app in minutes</h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              Watch a quick walkthrough, then explore friendly guides from adding services to
              managing your calendar.
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="gap-1.5">
                <PlayCircle />
                Watch video
              </Button>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/guides" />}
              >
                Browse guides
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-2 py-5">
          <h2 className="text-base font-semibold">Your Business</h2>
          <p className="text-sm text-muted-foreground">
            <Link href="/phone-numbers" className="text-foreground underline underline-offset-4">
              Add a phone number
            </Link>{' '}
            to start taking calls.
          </p>
          <Button size="sm" variant="outline" disabled className="mt-1 gap-1.5">
            <Phone />
            Test your receptionist
          </Button>
        </CardContent>
      </Card>

      <Link href="/analytics">
        <Card className="max-w-xs transition-colors hover:bg-accent">
          <CardContent className="space-y-1 py-4">
            <p className="text-sm text-muted-foreground">Calls (7d)</p>
            <p className="text-2xl font-semibold">0</p>
            <p className="text-xs text-muted-foreground">No prior data</p>
          </CardContent>
        </Card>
      </Link>

      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Latest Calls</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            No calls yet. Your recent calls will appear here.
          </p>
          <Link
            href="/phone-numbers"
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            Start receiving calls
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
