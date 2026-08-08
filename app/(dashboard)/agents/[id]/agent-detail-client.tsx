'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Pencil,
  Plus,
  ListChecks,
  Users,
  ShieldCheck,
  Wrench,
  CircleQuestionMark,
  ChevronDown,
  Trash,
  Phone,
  Settings2,
  X,
  Check,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
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
import {
  updateAgentGeneral,
  updateAgentCallSettings,
  searchVoices,
  renameAgent,
  setDefaultAgent,
  duplicateAgent,
  deleteAgent,
} from './actions'
import {
  voiceCatalog,
  languageOptions,
  normalizeLanguageCode,
  type VoiceCatalogEntry,
} from '@/lib/data/voice-catalog'
import { VoicePicker } from '@/components/voice/voice-picker'
import { InstructionsGeneratorPopover } from '@/components/agents/instructions-generator-popover'
import { CopyButton } from '@/components/ui/copy-button'
import { VoicesTab } from './voices-tab'
import { AdvancedSettingsTab } from './advanced-settings-tab'

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
  compact = false,
}: {
  title: string
  description?: string
  compact?: boolean
}) {
  return (
    <div className="space-y-1">
      <h2
        className={
          compact
            ? 'text-sm font-medium text-foreground'
            : 'font-heading text-xl font-semibold'
        }
      >
        {title}
      </h2>
      {description && (
        <p className={compact ? 'text-xs text-muted-foreground' : 'text-sm text-muted-foreground'}>
          {description}
        </p>
      )}
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
  const [activeTab, setActiveTab] = useState<(typeof TAB_VALUES)[number]>(
    TAB_VALUES.includes(initialTab as (typeof TAB_VALUES)[number])
      ? (initialTab as (typeof TAB_VALUES)[number])
      : 'general'
  )
  const [createVoiceOpen, setCreateVoiceOpen] = useState(false)

  // Receptionist switcher / edit / add state
  const [isSwitching, startSwitchTransition] = useTransition()
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState(agent.business_name ?? agent.name)
  const [editError, setEditError] = useState<string | null>(null)
  const [isSavingEdit, startEditTransition] = useTransition()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDeleting, startDeleteTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [isAdding, startAddTransition] = useTransition()

  function openEditDialog() {
    setEditName(agent.business_name ?? agent.name)
    setEditError(null)
    setEditOpen(true)
  }

  function handleSwitchAgent(id: string) {
    if (id === agent.id) return
    startSwitchTransition(async () => {
      await setDefaultAgent(id)
      router.push(`/agents/${id}`)
    })
  }

  function handleSaveEdit() {
    setEditError(null)
    startEditTransition(async () => {
      const result = await renameAgent(agent.id, { name: editName })
      if ('error' in result) {
        setEditError(result.error)
        return
      }
      setEditOpen(false)
      router.refresh()
    })
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      await deleteAgent(agent.id)
    })
  }

  function handleAddReceptionist() {
    setAddError(null)
    startAddTransition(async () => {
      const result = await duplicateAgent(agent.id, { name: addName })
      if ('error' in result) {
        setAddError(result.error)
        return
      }
      setAddOpen(false)
      setAddName('')
      router.push(`/agents/${result.id}`)
    })
  }

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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="w-56 justify-between font-normal" disabled={isSwitching} />
              }
            >
              <span className="truncate">{agent.business_name ?? agent.name}</span>
              <ChevronDown className="text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {agents.map((a) => (
                <DropdownMenuItem key={a.id} onClick={() => handleSwitchAgent(a.id)}>
                  {a.business_name ?? a.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setAddName('')
                  setAddError(null)
                  setAddOpen(true)
                }}
              >
                <Plus />
                Create new receptionist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="icon" aria-label="Edit receptionist" onClick={openEditDialog}>
            <Pencil />
          </Button>
          {activeTab === 'voices' && (
            <Button type="button" onClick={() => setCreateVoiceOpen(true)}>
              <Plus />
              Create voice
            </Button>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit receptionist</DialogTitle>
            <DialogDescription>
              Rename this receptionist or remove it. Phone numbers assigned to a deleted
              receptionist are released back to the workspace pool.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <Label htmlFor="edit-receptionist-name">Display name</Label>
              <Input
                id="edit-receptionist-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={agents.length <= 1}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash />
              Delete
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              onClick={handleSaveEdit}
              disabled={isSavingEdit || !editName.trim()}
            >
              <Check />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {agent.business_name ?? agent.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. Phone numbers assigned to this receptionist are
              released back to the workspace pool.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="gap-1.5" disabled={isDeleting}>
              <X />
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              <Trash />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add receptionist</DialogTitle>
            <DialogDescription>
              Settings are copied from <span className="font-medium">{agent.business_name ?? agent.name}</span> —
              you can change the voice, prompt, and phone numbers after creation.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <Label htmlFor="add-receptionist-name">Display name</Label>
              <Input
                id="add-receptionist-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Weekend receptionist"
              />
            </div>
            {addError && <p className="text-sm text-destructive">{addError}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => setAddOpen(false)}>
              <X />
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              onClick={handleAddReceptionist}
              disabled={isAdding || !addName.trim()}
            >
              <Plus />
              Add receptionist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as (typeof TAB_VALUES)[number])}>
        <TabsList variant="line" className="w-full justify-start gap-1 border-b [&>*]:flex-none">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="voices">Voices</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="call-settings">Call settings</TabsTrigger>
          <TabsTrigger value="advanced">Advanced settings</TabsTrigger>
        </TabsList>

        {/* General tab */}
        <TabsContent value="general" className="pt-6">
          <div className="grid max-w-[944px] grid-cols-1 gap-12 lg:grid-cols-[576px_320px]">
            <div className="space-y-8">
              <div className="space-y-2">
                <SectionHeading
                  title="Additional instructions"
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
                    className="field-sizing-fixed min-h-48 max-h-48 resize-none overflow-y-auto rounded-none border-0 focus-visible:ring-0"
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
                        triggerSize="icon-xs"
                      />
                      <CopyButton value={additionalInstructions} size="icon-xs" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <SectionHeading
                  compact
                  title="First message"
                  description="The first message the receptionist will say. If empty, the receptionist waits for user."
                />
                <div className="overflow-hidden rounded-2xl border border-border">
                  <Textarea
                    value={firstMessage}
                    onChange={(e) => setFirstMessage(e.target.value)}
                    rows={2}
                    placeholder="Enter the first message..."
                    className="resize-none rounded-none border-0 text-sm focus-visible:ring-0"
                  />
                  <div className="flex items-center justify-end border-t bg-muted/40 px-3 py-1.5">
                    <CopyButton value={firstMessage} size="icon-xs" />
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
                  title="Tone & personality"
                  description="Pick the traits your receptionist should embody on calls. All optional."
                />
                <div className="flex flex-wrap gap-1.5">
                  {TONE_TRAITS.map((trait) => {
                    const active = toneTraits.includes(trait)
                    return (
                      <Badge
                        key={trait}
                        variant={active ? 'default' : 'outline'}
                        render={<button type="button" onClick={() => toggleTrait(trait)} />}
                        className="cursor-pointer rounded-md"
                      >
                        {trait}
                      </Badge>
                    )
                  })}
                </div>
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
                              <Image
                                src={`https://hatscripts.github.io/circle-flags/flags/${selectedLang.countryCode}.svg`}
                                alt={`${selectedLang.label} flag`}
                                width={20}
                                height={20}
                                className="size-5 shrink-0 rounded-full"
                                unoptimized
                              />
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
                            <Image
                              src={`https://hatscripts.github.io/circle-flags/flags/${lang.countryCode}.svg`}
                              alt={`${lang.label} flag`}
                              width={20}
                              height={20}
                              className="size-5 shrink-0 rounded-full"
                              unoptimized
                            />
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
          <VoicesTab
            agent={agent}
            createOpen={createVoiceOpen}
            onCreateOpenChange={setCreateVoiceOpen}
          />
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
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setActiveTab('general')}>Edit instructions</Button>
                <Button variant="outline" onClick={() => setActiveTab('call-settings')}>
                  Call routing
                </Button>
              </div>
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
          <AdvancedSettingsTab agent={agent} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
