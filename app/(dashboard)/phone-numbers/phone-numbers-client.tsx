'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Phone, Search, ArrowUpRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Agent } from '@/lib/data/agents'
import type { OrgPhoneNumber } from '@/lib/data/phone-numbers'
import { reassignPhoneNumber } from './actions'

const UNASSIGNED = '__unassigned__'

export function PhoneNumbersClient({
  phoneNumbers: initialPhoneNumbers,
  agents,
}: {
  phoneNumbers: OrgPhoneNumber[]
  agents: Agent[]
}) {
  const [search, setSearch] = useState('')
  const [phoneNumbers, setPhoneNumbers] = useState(initialPhoneNumbers)
  const [reassigningId, setReassigningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return phoneNumbers
    return phoneNumbers.filter((pn) =>
      [pn.number, pn.agent_name ?? '', pn.provider].join(' ').toLowerCase().includes(query)
    )
  }, [phoneNumbers, search])

  function handleReassign(phoneNumberId: string, value: string | null) {
    const agentId = !value || value === UNASSIGNED ? null : value
    setError(null)
    setReassigningId(phoneNumberId)

    startTransition(async () => {
      const result = await reassignPhoneNumber({ phoneNumberId, agentId })
      setReassigningId(null)

      if ('error' in result) {
        setError(result.error)
        return
      }

      const agentName = agentId ? agents.find((a) => a.id === agentId)?.name ?? null : null
      setPhoneNumbers((prev) =>
        prev.map((pn) =>
          pn.id === phoneNumberId ? { ...pn, agent_id: agentId, agent_name: agentName } : pn
        )
      )
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Phone numbers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every number purchased across your receptionists, in one place.
          </p>
        </div>
        <Button className="gap-1.5" nativeButton={false} render={<Link href="/agents" />}>
          <Phone />
          Get a new number
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search numbers or receptionists"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <Empty className="border-0 py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Phone />
                </EmptyMedia>
                <EmptyTitle>
                  {phoneNumbers.length === 0 ? 'No phone numbers yet' : 'No matching numbers'}
                </EmptyTitle>
                <EmptyDescription>
                  {phoneNumbers.length === 0
                    ? 'Get a phone number from a receptionist to start taking calls.'
                    : 'Try a different search term.'}
                </EmptyDescription>
              </EmptyHeader>
              {phoneNumbers.length === 0 && (
                <EmptyContent>
                  <Button className="gap-1.5" nativeButton={false} render={<Link href="/agents" />}>
                    <Phone />
                    Get a new number
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <ul className="divide-y">
              {filtered.map((pn) => (
                <li
                  key={pn.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex items-center gap-2 font-medium">
                      <Phone className="size-4 shrink-0 text-muted-foreground" />
                      {pn.number}
                      <Badge variant="outline" className="capitalize">
                        {pn.provider}
                      </Badge>
                    </p>
                    {pn.agent_id ? (
                      <Link
                        href={`/agents/${pn.agent_id}`}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
                      >
                        {pn.agent_name ?? 'Unknown receptionist'}
                        <ArrowUpRight className="size-3" />
                      </Link>
                    ) : (
                      <p className="text-sm text-muted-foreground">Unassigned</p>
                    )}
                  </div>
                  <div className="w-56 shrink-0">
                    <Select
                      value={pn.agent_id ?? UNASSIGNED}
                      disabled={isPending && reassigningId === pn.id}
                      onValueChange={(value) => handleReassign(pn.id, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Assign to receptionist" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {agents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
