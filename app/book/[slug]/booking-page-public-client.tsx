'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Service } from '@/lib/data/business'
import type { BookingPageStaff } from '@/lib/data/availability-engine'
import { CallDialog } from '@/components/voice/call-dialog'
import { Turnstile } from '@/components/voice/turnstile'
import { bookingAccentText } from '@/lib/booking-theme'
import { BookingFlow } from './booking-flow'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export function BookingPagePublicClient({
  organizationId,
  organizationName,
  services,
  staff,
  agentId,
  agentName,
  theme = 'light',
  accent = '#4F46E5',
}: {
  organizationId: string
  organizationName: string
  services: Service[]
  staff: BookingPageStaff[]
  agentId: string | null
  agentName: string
  theme?: 'light' | 'dark'
  accent?: string
}) {
  const [callOpen, setCallOpen] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const isDark = theme === 'dark'
  const requireChallenge = Boolean(TURNSTILE_SITE_KEY)

  return (
    <div className={cn('min-h-svh', isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-background text-foreground')}>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <div className="space-y-1 text-center">
          <h1 className="font-heading text-2xl font-semibold">{organizationName}</h1>
          <p className={cn('text-sm', isDark ? 'text-zinc-400' : 'text-muted-foreground')}>
            Book an appointment or talk to our receptionist.
          </p>
        </div>

        {agentId && (
          <div className="flex flex-col items-center gap-3">
            {TURNSTILE_SITE_KEY && (
              <Turnstile
                siteKey={TURNSTILE_SITE_KEY}
                theme={isDark ? 'dark' : 'light'}
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
              />
            )}
            <Button
              onClick={() => setCallOpen(true)}
              disabled={requireChallenge && !turnstileToken}
              className="gap-1.5"
              style={{ backgroundColor: accent, color: bookingAccentText(accent) }}
            >
              <Phone />
              Talk to {agentName}
            </Button>
          </div>
        )}

        {services.length > 0 && (
          <BookingFlow
            organizationId={organizationId}
            organizationName={organizationName}
            services={services}
            staff={staff}
            theme={theme}
            accent={accent}
          />
        )}

        {agentId && (
          <CallDialog
            open={callOpen}
            onOpenChange={setCallOpen}
            organizationId={organizationId}
            agentId={agentId}
            agentName={agentName}
            authenticated={false}
            turnstileToken={turnstileToken}
          />
        )}
      </div>
    </div>
  )
}
