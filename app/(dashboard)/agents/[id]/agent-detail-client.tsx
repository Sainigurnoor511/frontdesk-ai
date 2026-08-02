'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil,
  Speaker,
  ListChecks,
  Users,
  ShieldCheck,
  Wrench,
  CircleQuestionMark,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import type { AgentDetail, Agent } from '@/lib/data/agents'
import { updateAgentGeneral, updateAgentCallSettings, searchVoices } from './actions'
import {
  voiceCatalog,
  languageOptions,
  normalizeLanguageCode,
  type VoiceCatalogEntry,
} from '@/lib/data/voice-catalog'
import { VoicePicker } from '@/components/voice/voice-picker'
import { InstructionsGeneratorPopover } from '@/components/agents/instructions-generator-popover'
import { CopyButton } from '@/components/ui/copy-button'

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

function SectionHeading({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="space-y-1">
      <h3 className="font-heading text-2xl font-semibold">{title}</h3>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

const TAB_VALUES = ['general', 'voices', 'rules', 'call-settings', 'advanced'] as const

export function AgentDetailClient({
  agent,
  agents,
  initialTab,
}: {
  agent: AgentDetail
  agents: Agent[]
  initialTab?: string
}) {
  const router = useRouter()
  const activeTab = TAB_VALUES.includes(initialTab as (typeof TAB_VALUES)[number])
    ? (initialTab as (typeof TAB_VALUES)[number])
    : 'general'

  // General tab state
  const [voiceId, setVoiceId] = useState(agent.voice_id ?? voiceCatalog[0]?.id ?? '')
  const [defaultLanguage, setDefaultLanguage] = useState(
    agent.language ? normalizeLanguageCode(agent.language) : languageOptions[0].code
  )
  const [detectLanguage, setDetectLanguage] = useState(false)
  const [voiceSearchResults, setVoiceSearchResults] = useState<VoiceCatalogEntry[]>([])

  async function handleVoiceSearch(query: string) {
    if (!query) {
      setVoiceSearchResults([])
      return
    }
    const results = await searchVoices(query, defaultLanguage)
    setVoiceSearchResults(results)
  }

  const shortlistForLanguage = voiceCatalog.filter((voice) => voice.language === defaultLanguage)
  const voiceOptionsToShow = voiceSearchResults.length > 0 ? voiceSearchResults : shortlistForLanguage
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

  const originalToneTraits = agent.tone_traits ?? []
  const originalLanguage = agent.language
    ? normalizeLanguageCode(agent.language)
    : languageOptions[0].code
  const generalDirty =
    voiceId !== (agent.voice_id ?? voiceCatalog[0]?.id ?? '') ||
    defaultLanguage !== originalLanguage ||
    additionalInstructions !== (agent.additional_instructions ?? '') ||
    firstMessage !== (agent.first_message ?? '') ||
    toneTraits.length !== originalToneTraits.length ||
    toneTraits.some((trait) => !originalToneTraits.includes(trait))

  function handleCancelGeneral() {
    setVoiceId(agent.voice_id ?? voiceCatalog[0]?.id ?? '')
    setDefaultLanguage(originalLanguage)
    setAdditionalInstructions(agent.additional_instructions ?? '')
    setToneTraits(agent.tone_traits ?? [])
    setFirstMessage(agent.first_message ?? '')
  }

  const callSettingsDirty =
    answeringMode !== (agent.answering_mode ?? 'staff_first') ||
    staffPhoneNumber !== (agent.staff_phone_number ?? '') ||
    maxRingSeconds !== agent.max_ring_seconds ||
    holdMusic !== (agent.hold_music ?? '')

  function handleCancelCallSettings() {
    setAnsweringMode(agent.answering_mode ?? 'staff_first')
    setStaffPhoneNumber(agent.staff_phone_number ?? '')
    setMaxRingSeconds(agent.max_ring_seconds)
    setHoldMusic(agent.hold_music ?? '')
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">Receptionists</h1>
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
              <SelectTrigger className="w-56">
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
            <Pencil />
          </Button>
        </div>
      </div>

      <Tabs defaultValue={activeTab}>
        <TabsList variant="line" className="w-full justify-start gap-1 border-b [&>*]:flex-none">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="voices">Voices</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="call-settings">Call settings</TabsTrigger>
          <TabsTrigger value="advanced">Advanced settings</TabsTrigger>
        </TabsList>

        {/* General tab */}
        <TabsContent value="general" className="pt-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            <div className="max-w-xl space-y-8">
              <div className="space-y-2">
                <SectionHeading
                  title="Additional Instructions"
                  description={`Extra instructions for the receptionist. E.g. "If someone asks about parking, mention the free parking lot behind the building."`}
                />
                <div className="overflow-hidden rounded-2xl border border-border">
                  <Textarea
                    value={additionalInstructions}
                    onChange={(e) =>
                      setAdditionalInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS_LENGTH))
                    }
                    maxLength={MAX_INSTRUCTIONS_LENGTH}
                    rows={12}
                    placeholder="e.g. If someone asks about parking, mention the free parking lot behind the building."
                    className="min-h-64 resize-none rounded-none border-0 focus-visible:ring-0"
                  />
                  <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {additionalInstructions.length} / {MAX_INSTRUCTIONS_LENGTH}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <InstructionsGeneratorPopover
                        businessName={agent.business_name}
                        industry={agent.industry}
                        onGenerated={(text) => setAdditionalInstructions(text)}
                      />
                      <CopyButton value={additionalInstructions} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <SectionHeading
                  title="Tone & personality"
                  description="Pick the traits your receptionist should embody on calls. All optional."
                />
                <div className="flex flex-wrap gap-2">
                  {TONE_TRAITS.map((trait) => {
                    const active = toneTraits.includes(trait)
                    return (
                      <Badge
                        key={trait}
                        variant={active ? 'default' : 'outline'}
                        render={<button type="button" onClick={() => toggleTrait(trait)} />}
                        className="h-8 cursor-pointer rounded-lg px-2.5 text-sm"
                      >
                        {trait}
                      </Badge>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionHeading
                  title="First message"
                  description="The first message the receptionist will say. If empty, the receptionist waits for user."
                />
                <div className="overflow-hidden rounded-2xl border border-border">
                  <Textarea
                    value={firstMessage}
                    onChange={(e) => setFirstMessage(e.target.value)}
                    rows={3}
                    placeholder="Enter the first message..."
                    className="resize-none rounded-none border-0 focus-visible:ring-0"
                  />
                  <div className="flex items-center justify-end border-t bg-muted/40 px-3 py-2">
                    <CopyButton value={firstMessage} />
                  </div>
                </div>
              </div>

              {generalError && <p className="text-sm text-destructive">{generalError}</p>}

              <UnsavedChangesBar
                show={generalDirty}
                saving={isSavingGeneral}
                onSave={handleSaveGeneral}
                onCancel={handleCancelGeneral}
              />
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <SectionHeading
                  title="Receptionist voice"
                  description="Select the voice for the receptionist."
                />
                <VoicePicker
                  voices={voiceOptionsToShow}
                  value={voiceId}
                  onValueChange={setVoiceId}
                  onSearch={handleVoiceSearch}
                  placeholder="Select a voice"
                />
              </div>

              <div className="space-y-2">
                <SectionHeading
                  title="Languages"
                  description="Choose the default and additional languages the receptionist will communicate in."
                />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Default language</Label>
                  <Select
                    value={defaultLanguage}
                    onValueChange={(value) => setDefaultLanguage(value as string)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a language">
                        {(value: string) => {
                          const selectedLang = languageOptions.find((lang) => lang.code === value)
                          return selectedLang ? (
                            <span className="flex items-center gap-2">
                              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs">
                                {selectedLang.flag}
                              </span>
                              {selectedLang.label}
                            </span>
                          ) : (
                            'Select a language'
                          )
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {languageOptions.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          <span className="flex items-center gap-2">
                            <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs">
                              {lang.flag}
                            </span>
                            {lang.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Additional languages</Label>
                  {/* TODO: build real multi-language selection */}
                  <Button variant="outline" size="sm" disabled className="w-full justify-start">
                    Add additional languages
                  </Button>
                </div>

                <div className="flex items-center gap-1.5 rounded-[10px] border border-border px-2.5 py-2">
                  <Wrench className="size-4 shrink-0 text-foreground" />
                  <span className="text-sm font-medium">Detect language</span>
                  <CircleQuestionMark className="size-3.5 shrink-0 text-muted-foreground" />
                  <Switch
                    checked={detectLanguage}
                    onCheckedChange={setDetectLanguage}
                    className="ml-auto"
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Voices tab */}
        <TabsContent value="voices" className="pt-6">
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Speaker className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Voice library coming soon</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Manage and preview receptionist voices here once the voice catalog integration is
                wired up. For now, choose a voice from the General tab.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules tab */}
        <TabsContent value="rules" className="pt-6">
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
                    <Users className="h-4 w-4 text-muted-foreground" />
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
        <TabsContent value="call-settings" className="pt-6">
          <div className="max-w-md space-y-6">
            <div className="space-y-2">
              <SectionHeading title="Call routing" description="Control how incoming calls are answered and routed." />

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Answering mode</Label>
                  <Select
                    value={answeringMode}
                    onValueChange={(value) =>
                      setAnsweringMode(value as 'staff_first' | 'agent_first')
                    }
                  >
                    <SelectTrigger className="w-full">
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
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="hold-music">Hold music</Label>
                  <Input
                    id="hold-music"
                    value={holdMusic}
                    onChange={(e) => setHoldMusic(e.target.value)}
                    placeholder="Default"
                  />
                </div>
              </div>
            </div>

            {callSettingsError && <p className="text-sm text-destructive">{callSettingsError}</p>}

            <UnsavedChangesBar
              show={callSettingsDirty}
              saving={isSavingCallSettings}
              onSave={handleSaveCallSettings}
              onCancel={handleCancelCallSettings}
            />
          </div>
        </TabsContent>

        {/* Advanced settings tab */}
        <TabsContent value="advanced" className="pt-6">
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
