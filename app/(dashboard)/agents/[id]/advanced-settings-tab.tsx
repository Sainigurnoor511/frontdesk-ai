'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
import { SettingsCard } from '../../booking-page/section-layout'
import type { AgentDetail } from '@/lib/data/agents'
import {
  AGENT_HOLD_SOUNDS,
  AGENT_LLM_MODELS,
  AGENT_REASONING_EFFORTS,
  normalizeAgentLlmModel,
  type AgentHoldSound,
  type AgentLlmModel,
  type AgentReasoningEffort,
} from '@/lib/data/agent-advanced-options'
import { updateAgentAdvancedSettings } from './actions'

function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function normalizeHoldSound(value: string | null): AgentHoldSound {
  if (value === 'office' || value === 'soft_music' || value === 'none') return value
  return 'default'
}

export function AdvancedSettingsTab({ agent }: { agent: AgentDetail }) {
  const router = useRouter()
  const normalizedLlmModel = normalizeAgentLlmModel(agent.llm_model)
  const [llmModel, setLlmModel] = useState<AgentLlmModel>(normalizedLlmModel)
  const [reasoningEffort, setReasoningEffort] = useState<AgentReasoningEffort>(
    agent.reasoning_effort ?? 'minimal'
  )
  const [filterBackgroundSpeech, setFilterBackgroundSpeech] = useState(
    agent.filter_background_speech ?? false
  )
  const [skipKnowledgeRetrieval, setSkipKnowledgeRetrieval] = useState(
    agent.skip_knowledge_retrieval ?? false
  )
  const [allowDtmf, setAllowDtmf] = useState(agent.allow_dtmf ?? false)
  const [holdSound, setHoldSound] = useState<AgentHoldSound>(normalizeHoldSound(agent.hold_sound))
  const [typingSoundEnabled, setTypingSoundEnabled] = useState(
    agent.typing_sound_enabled ?? true
  )
  const [secureMode, setSecureMode] = useState(agent.secure_mode ?? false)
  const [identityVerificationEnabled, setIdentityVerificationEnabled] = useState(
    agent.identity_verification_enabled ?? false
  )
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaveTransition] = useTransition()

  const dirty =
    llmModel !== normalizedLlmModel ||
    reasoningEffort !== (agent.reasoning_effort ?? 'minimal') ||
    filterBackgroundSpeech !== (agent.filter_background_speech ?? false) ||
    skipKnowledgeRetrieval !== (agent.skip_knowledge_retrieval ?? false) ||
    allowDtmf !== (agent.allow_dtmf ?? false) ||
    holdSound !== normalizeHoldSound(agent.hold_sound) ||
    typingSoundEnabled !== (agent.typing_sound_enabled ?? true) ||
    secureMode !== (agent.secure_mode ?? false) ||
    identityVerificationEnabled !== (agent.identity_verification_enabled ?? false)

  function handleCancel() {
    setLlmModel(normalizeAgentLlmModel(agent.llm_model))
    setReasoningEffort(agent.reasoning_effort ?? 'minimal')
    setFilterBackgroundSpeech(agent.filter_background_speech ?? false)
    setSkipKnowledgeRetrieval(agent.skip_knowledge_retrieval ?? false)
    setAllowDtmf(agent.allow_dtmf ?? false)
    setHoldSound(normalizeHoldSound(agent.hold_sound))
    setTypingSoundEnabled(agent.typing_sound_enabled ?? true)
    setSecureMode(agent.secure_mode ?? false)
    setIdentityVerificationEnabled(agent.identity_verification_enabled ?? false)
    setError(null)
  }

  function handleSave() {
    setError(null)
    startSaveTransition(async () => {
      const result = await updateAgentAdvancedSettings(agent.id, {
        llmModel,
        reasoningEffort,
        filterBackgroundSpeech,
        skipKnowledgeRetrieval,
        allowDtmf,
        holdSound,
        typingSoundEnabled,
        secureMode,
        identityVerificationEnabled,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <SettingsCard
        title="Models"
        description="Choose the language model that powers the receptionist. Different models trade off speed, cost, and quality."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select
              value={llmModel}
              onValueChange={(value) => setLlmModel(value as AgentLlmModel)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_LLM_MODELS.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Saved values use Groq model ids directly.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Reasoning effort</Label>
            <Select
              value={reasoningEffort}
              onValueChange={(value) => setReasoningEffort(value as AgentReasoningEffort)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_REASONING_EFFORTS.map((effort) => (
                  <SelectItem key={effort.value} value={effort.value}>
                    {effort.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Higher effort can improve answer quality on complex calls but makes responses
              slower.
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Speech recognition"
        description="Control which speech the receptionist responds to."
      >
        <SettingRow
          title="Filter background speech"
          description="Enable background voice detection to filter out far-field human speech."
        >
          <Switch
            checked={filterBackgroundSpeech}
            onCheckedChange={(checked) => setFilterBackgroundSpeech(Boolean(checked))}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title="Knowledge base"
        description="Control how the receptionist reads its knowledge base during calls."
      >
        <SettingRow
          title="Skip retrieval (RAG)"
          description="Inject the whole knowledge into the prompt instead of retrieving relevant parts on each turn. This lowers response time but only works with small knowledge bases — larger ones keep using retrieval (RAG)."
        >
          <Switch
            checked={skipKnowledgeRetrieval}
            onCheckedChange={(checked) => setSkipKnowledgeRetrieval(Boolean(checked))}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title="Touch tones (DTMF)"
        description="Let the receptionist play keypad touch tones during a live call."
      >
        <SettingRow
          title="Allow playing touch tones"
          description="When enabled, the receptionist can key touch tones to navigate automated phone menus or answer carrier prompts such as a &quot;press 1 to accept&quot; call-screening step. It decides when to use them based on the conversation, so results can vary."
        >
          <Switch
            checked={allowDtmf}
            onCheckedChange={(checked) => setAllowDtmf(Boolean(checked))}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title="Hold sound"
        description="Play an ambient sound while the receptionist looks things up (for example, checking availability), so callers don't hear silence."
      >
        <div className="space-y-1.5">
          <Label>Hold sound</Label>
          <Select
            value={holdSound}
            onValueChange={(value) => setHoldSound(value as AgentHoldSound)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENT_HOLD_SOUNDS.map((sound) => (
                <SelectItem key={sound.value} value={sound.value}>
                  {sound.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Typing"
        description="Audio feedback while the receptionist prepares a response."
      >
        <SettingRow
          title="Play typing sound"
          description="Play a subtle typing indicator sound while the receptionist is thinking or composing a reply."
        >
          <Switch
            checked={typingSoundEnabled}
            onCheckedChange={(checked) => setTypingSoundEnabled(Boolean(checked))}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title="Security"
        description="Configure safeguards for accessing and editing client information."
      >
        <div className="space-y-4">
          <SettingRow
            title="Secure mode"
            description="Only allows client lookups and edits when the caller's phone number matches the one on file. When the phone number does not match, or the conversation is through the web, the identity verification tool is required to access or edit client information."
          >
            <Switch
              checked={secureMode}
              onCheckedChange={(checked) => setSecureMode(Boolean(checked))}
            />
          </SettingRow>

          <SettingRow
            title="Identity verification tool"
            description="Allows the receptionist to send a one-time code by SMS or email to the client's contact information on file and verify their identity for the conversation."
          >
            <Switch
              checked={identityVerificationEnabled}
              onCheckedChange={(checked) =>
                setIdentityVerificationEnabled(Boolean(checked))
              }
            />
          </SettingRow>
        </div>
      </SettingsCard>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <UnsavedChangesBar
        show={dirty}
        saving={isSaving}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  )
}
