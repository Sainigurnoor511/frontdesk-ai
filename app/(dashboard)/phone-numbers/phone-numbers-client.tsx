'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Phone, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateAgentCallSettings } from '@/app/(dashboard)/agents/[id]/actions'
import type { AgentDetail } from '@/lib/data/agents'

export function PhoneNumbersClient({
  agent,
}: {
  agent: AgentDetail
}) {
  const [phone, setPhone] = useState(agent.staff_phone_number ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateAgentCallSettings(agent.id, {
        staffPhoneNumber: phone.trim(),
        answeringMode: agent.answering_mode ?? 'agent_first',
        maxRingSeconds: agent.max_ring_seconds,
        holdMusic: agent.hold_music ?? undefined,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setSaved(true)
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Phone numbers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set the number callers can reach when your receptionist hands off to a person.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Phone className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">Staff fallback number</p>
              <p className="text-sm text-muted-foreground">
                Shown on your booking page as &quot;Or call&quot; and used when routing calls to
                your team. Web calls use LiveKit — this is your human handoff line.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-phone">Phone number</Label>
            <Input
              id="staff-phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setSaved(false)
              }}
              placeholder="+1 415 555 1234"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-emerald-600">Phone number saved.</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save number'}
            </Button>
            <Button
              type="button"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/agents/${agent.id}?tab=call-settings`} />}
            >
              <ExternalLink className="size-4" />
              Call routing settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-5">
          <p className="font-medium">Provisioned inbound numbers</p>
          <p className="text-sm text-muted-foreground">
            Buying and assigning dedicated phone numbers through Twilio is coming soon. For now,
            configure your staff fallback number above and use web calls to test your receptionist.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
