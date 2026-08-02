'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Phone } from '@phosphor-icons/react/dist/ssr'
import type { Service } from '@/lib/data/business'
import { CallDialog } from '@/components/voice/call-dialog'

function formatPrice(price: number) {
  return `$${price.toFixed(2)}`
}

export function BookingPagePublicClient({
  organizationId,
  organizationName,
  services,
  agentId,
  agentName,
}: {
  organizationId: string
  organizationName: string
  services: Service[]
  agentId: string | null
  agentName: string
}) {
  const [callOpen, setCallOpen] = useState(false)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">{organizationName}</h1>
        <p className="text-sm text-muted-foreground">Book an appointment or talk to our receptionist.</p>
      </div>

      {agentId && (
        <div className="flex justify-center">
          <Button onClick={() => setCallOpen(true)} className="gap-1.5">
            <Phone />
            Talk to {agentName}
          </Button>
        </div>
      )}

      {services.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {services.map((service) => (
              <div key={service.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{service.name}</p>
                  <p className="text-xs text-muted-foreground">{service.durationMinutes} min</p>
                </div>
                <p className="text-sm font-medium">{formatPrice(service.price)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {agentId && (
        <CallDialog
          open={callOpen}
          onOpenChange={setCallOpen}
          organizationId={organizationId}
          agentId={agentId}
          agentName={agentName}
          authenticated={false}
        />
      )}
    </div>
  )
}
