'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  PencilSimple,
  SpeakerHigh,
  ListChecks,
  UsersThree,
  ShieldCheck,
} from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { AgentDetail, Agent } from '@/lib/data/agents'
import { updateAgentGeneral, updateAgentCallSettings } from './actions'

const VOICE_OPTIONS = [
  { id: 'default-neutral', label: 'Default — Neutral' },
  { id: 'warm-friendly', label: 'Warm — Friendly' },
  { id: 'professional-calm', label: 'Professional — Calm' },
]

const LANGUAGE_OPTIONS = ['English', 'Hindi']

const TONE_TRAITS = [
  'Professional',
  'Concise',
  'Friendly',
  'Warm',
  'Formal',
  'Empathetic',
  'Direct',
  'Upbeat',
]

const MAX_INSTRUCTIONS_LENGTH = 8000

export function AgentDetailClient({
  agent,
  agents,
}: {
  agent: AgentDetail
  agents: Agent[]
}) {
  const router = useRouter()

  // General tab state
  const [voiceId, setVoiceId] = useState(agent.voice_id ?? VOICE_OPTIONS[0].id)
  const [defaultLanguage, setDefaultLanguage] = useState(agent.language ?? LANGUAGE_OPTIONS[0])
  const [detectLanguage, setDetectLanguage] = useState(false)
  const [additionalInstructions, setAdditionalInstructions] = useState(
    agent.additional_instructions ?? ''
  )
  const [toneTraits, setToneTraits] = useState<string[]>(agent.tone_traits ?? [])
  const [firstMessage, setFirstMessage] = useState(agent.first_message ?? '')
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isSavingGeneral, startGeneralTransition] = useTransition()

  // Call settings tab state
  const [answeringMode, setAnsweringMode] = useState(agent.answering_mode ?? 'staff_first')
  const [staffPhoneNumber, setStaffPhoneNumber] = useState(agent.staff_phone_number ?? '')
  const [maxRingSeconds, setMaxRingSeconds] = useState(agent.max_ring_seconds)
  const [holdMusic, setHoldMusic] = useState(agent.hold_music ?? '')
  const [callSettingsError, setCallSettingsError] = useState<string | null>(null)
  const [isSavingCallSettings, startCallSettingsTransition] = useTransition()

  function toggleTrait(trait: string) {
    setToneTraits((prev) =>
      prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]
    )
  }

  function handleSaveGeneral() {
    setGeneralError(null)
    startGeneralTransition(async () => {
      const result = await updateAgentGeneral(agent.id, {
        voiceId,
        defaultLanguage,
        additionalInstructions,
        toneTraits,
        firstMessage,
      })
      if ('error' in result) {
        setGeneralError(result.error)
      }
    })
  }

  function handleSaveCallSettings() {
    setCallSettingsError(null)
    startCallSettingsTransition(async () => {
      const result = await updateAgentCallSettings(agent.id, {
        answeringMode,
        staffPhoneNumber,
        maxRingSeconds,
        holdMusic,
      })
      if ('error' in result) {
        setCallSettingsError(result.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{agent.business_name ?? agent.name}</h1>
          <p className="mt-1 text-sm font-normal text-[#96989d]">
            {agent.industry} · {agent.country} · {agent.language}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {agents.length > 1 && (
            <Select
              value={agent.id}
              onValueChange={(value) => {
                if (typeof value === 'string' && value !== agent.id) {
                  router.push(`/agents/${value}`)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select receptionist" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.business_name ?? a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* TODO: wire up edit receptionist (rename/delete) action */}
          <Button variant="outline" size="icon" aria-label="Edit receptionist">
            <PencilSimple />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="voices">Voices</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="call-settings">Call settings</TabsTrigger>
          <TabsTrigger value="advanced">Advanced settings</TabsTrigger>
        </TabsList>

        {/* General tab */}
        <TabsContent value="general" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Receptionist voice</CardTitle>
              <CardDescription>Choose the voice your receptionist uses on calls.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <Select value={voiceId} onValueChange={(value) => setVoiceId(value as string)}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_OPTIONS.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* TODO: wire up real voice catalog (ElevenLabs/Fish Audio) browsing */}
              <Button variant="ghost" size="sm">
                Browse all voices
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Languages</CardTitle>
              <CardDescription>Set the default language and any additional languages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Default language</Label>
                <Select value={defaultLanguage} onValueChange={(value) => setDefaultLanguage(value as string)}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Additional languages</Label>
                {/* TODO: build real multi-language selection */}
                <div>
                  <Button variant="outline" size="sm" disabled>
                    Add additional languages
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Detect language</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically detect and respond in the caller&apos;s language.
                  </p>
                </div>
                <Switch checked={detectLanguage} onCheckedChange={setDetectLanguage} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Additional Instructions</CardTitle>
              <CardDescription>
                Give your receptionist extra context or instructions to follow on every call.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS_LENGTH))}
                maxLength={MAX_INSTRUCTIONS_LENGTH}
                rows={5}
                placeholder="Enter additional instructions..."
              />
              <p className="text-right text-xs text-muted-foreground">
                {additionalInstructions.length} / {MAX_INSTRUCTIONS_LENGTH}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tone &amp; personality</CardTitle>
              <CardDescription>Pick the traits that best describe how your receptionist should sound.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {TONE_TRAITS.map((trait) => {
                const active = toneTraits.includes(trait)
                return (
                  <Badge
                    key={trait}
                    variant={active ? 'default' : 'outline'}
                    render={<button type="button" onClick={() => toggleTrait(trait)} />}
                    className="h-7 cursor-pointer px-3 text-sm"
                  >
                    {trait}
                  </Badge>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>First message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Textarea
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                rows={3}
                placeholder="Enter the first message..."
              />
              <p className="text-sm text-muted-foreground">
                The first message the receptionist will say. If empty, the receptionist waits for user.
              </p>
            </CardContent>
          </Card>

          {generalError && <p className="text-sm text-destructive">{generalError}</p>}

          <div className="flex justify-end">
            <Button onClick={handleSaveGeneral} disabled={isSavingGeneral}>
              {isSavingGeneral ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </TabsContent>

        {/* Voices tab */}
        <TabsContent value="voices" className="pt-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <SpeakerHigh className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Voice library coming soon</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Manage and preview receptionist voices here once the voice catalog integration is
                wired up. For now, choose a voice from the General tab.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules tab */}
        <TabsContent value="rules" className="pt-4">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListChecks />
              </EmptyMedia>
              <EmptyTitle>No rules yet</EmptyTitle>
              <EmptyDescription>
                Rules tell your receptionist how to behave - what to do in specific situations and
                when to hand a call to a person.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
                <Card size="sm">
                  <CardContent className="space-y-1">
                    <ListChecks className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Guide behavior</p>
                    <p className="text-xs text-muted-foreground">
                      Guide how it handles specific situations
                    </p>
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardContent className="space-y-1">
                    <UsersThree className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Handoff to a human</p>
                    <p className="text-xs text-muted-foreground">
                      Set when to transfer to a human
                    </p>
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardContent className="space-y-1">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Consistent</p>
                    <p className="text-xs text-muted-foreground">
                      Applied consistently on every call
                    </p>
                  </CardContent>
                </Card>
              </div>
              {/* TODO: build the rules engine */}
              <Button disabled>Add rule</Button>
            </EmptyContent>
          </Empty>
        </TabsContent>

        {/* Call settings tab */}
        <TabsContent value="call-settings" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Call routing</CardTitle>
              <CardDescription>Control how incoming calls are answered and routed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Answering mode</Label>
                <Select
                  value={answeringMode}
                  onValueChange={(value) =>
                    setAnsweringMode(value as 'staff_first' | 'agent_first')
                  }
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select answering mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff_first">Staff first</SelectItem>
                    <SelectItem value="agent_first">Receptionist first</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-phone">Staff phone number</Label>
                <Input
                  id="staff-phone"
                  value={staffPhoneNumber}
                  onChange={(e) => setStaffPhoneNumber(e.target.value)}
                  placeholder="+14155551234"
                  className="w-64"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="max-ring-seconds">Max ring seconds</Label>
                <Input
                  id="max-ring-seconds"
                  type="number"
                  min={5}
                  max={60}
                  value={maxRingSeconds}
                  onChange={(e) => setMaxRingSeconds(Number(e.target.value))}
                  className="w-64"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hold-music">Hold music</Label>
                <Input
                  id="hold-music"
                  value={holdMusic}
                  onChange={(e) => setHoldMusic(e.target.value)}
                  placeholder="Default"
                  className="w-64"
                />
              </div>
            </CardContent>
          </Card>

          {callSettingsError && <p className="text-sm text-destructive">{callSettingsError}</p>}

          <div className="flex justify-end">
            <Button onClick={handleSaveCallSettings} disabled={isSavingCallSettings}>
              {isSavingCallSettings ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </TabsContent>

        {/* Advanced settings tab */}
        <TabsContent value="advanced" className="pt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Advanced configuration options are coming soon.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
