'use client'

import { useEffect, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VoiceOrbButton } from '@/components/voice/voice-orb-button'
import { CreateVoiceDialog } from '@/components/agents/create-voice-dialog'
import {
  voiceCatalog,
  languageOptions,
  type VoiceCatalogEntry,
} from '@/lib/data/voice-catalog'
import {
  searchVoices,
  getFavoriteVoiceIds,
  getCustomVoices,
  toggleFavoriteVoice,
  updateAgentGeneral,
  type VoiceSearchResult,
} from './actions'
import type { AgentDetail, Agent } from '@/lib/data/agents'

const GENDER_OPTIONS = ['male', 'female'] as const
const AGE_OPTIONS = ['young', 'middle-aged', 'old'] as const
const ALL_VALUE = '__all'

export function VoicesTab({
  agent,
  agents,
  createOpen,
  onCreateOpenChange,
}: {
  agent: AgentDetail
  agents: Agent[]
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
}) {
  const [selectedAgentId, setSelectedAgentId] = useState(agent.id)
  const [currentVoiceId, setCurrentVoiceId] = useState(agent.voice_id ?? '')
  const [customVoices, setCustomVoices] = useState<VoiceSearchResult[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VoiceSearchResult[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [languageFilter, setLanguageFilter] = useState<string | null>(null)
  const [genderFilter, setGenderFilter] = useState<string | null>(null)
  const [ageFilter, setAgeFilter] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    void getFavoriteVoiceIds().then(setFavorites)
    void getCustomVoices().then(setCustomVoices)
  }, [])

  function handleSelectAgent(id: string | null) {
    if (!id) return
    setSelectedAgentId(id)
    const next = agents.find((a) => a.id === id)
    setCurrentVoiceId(next?.voice_id ?? '')
  }

  useEffect(() => {
    if (!query) return
    const timeout = setTimeout(() => {
      void searchVoices(query, languageFilter ?? undefined).then(setResults)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, languageFilter])

  const baseList: VoiceSearchResult[] = query ? results : [...customVoices, ...voiceCatalog]
  const filtered = baseList.filter((voice) => {
    if (languageFilter && voice.language !== languageFilter) return false
    if (genderFilter && voice.gender !== genderFilter) return false
    if (ageFilter && voice.age !== ageFilter) return false
    return true
  })

  const currentVoice = [...customVoices, ...voiceCatalog, ...results].find(
    (v) => v.id === currentVoiceId
  )

  function togglePreview(voice: VoiceCatalogEntry) {
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    if (playingId === voice.id) {
      audio.pause()
      setPlayingId(null)
      return
    }
    audio.pause()
    audio.src = voice.previewUrl
    audio.onended = () => setPlayingId(null)
    void audio.play()
    setPlayingId(voice.id)
  }

  async function handleSelectVoice(voiceId: string) {
    setCurrentVoiceId(voiceId)
    await updateAgentGeneral(selectedAgentId, { voiceId })
  }

  async function handleToggleFavorite(voiceId: string) {
    const result = await toggleFavoriteVoice(voiceId)
    if ('favorited' in result) {
      setFavorites((prev) =>
        result.favorited ? [...prev, voiceId] : prev.filter((id) => id !== voiceId)
      )
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pick how your receptionist sounds. Preview, favorite, and switch anytime.
      </p>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {agents.length > 1 && (
            <Select value={selectedAgentId} onValueChange={handleSelectAgent}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select receptionist">
                  {(value: string) => {
                    const next = agents.find((a) => a.id === value)
                    return next ? (next.business_name ?? next.name) : 'Select receptionist'
                  }}
                </SelectValue>
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
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search library voices..."
            className="max-w-sm"
          />
        </div>
        {currentVoice && (
          <p className="shrink-0 text-sm text-muted-foreground">
            Currently using{' '}
            <span className="font-medium text-foreground">{currentVoice.label}</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={languageFilter ?? ALL_VALUE}
          onValueChange={(v) => setLanguageFilter(v === ALL_VALUE ? null : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Language">
              {(value: string) => {
                const lang = languageOptions.find((l) => l.code === value)
                return lang ? `${lang.flag} ${lang.label}` : 'All languages'
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All languages</SelectItem>
            {languageOptions.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.flag} {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={genderFilter ?? ALL_VALUE}
          onValueChange={(v) => setGenderFilter(v === ALL_VALUE ? null : v)}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Gender">
              {(value: string) => (value === ALL_VALUE ? 'Any gender' : value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Any gender</SelectItem>
            {GENDER_OPTIONS.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={ageFilter ?? ALL_VALUE}
          onValueChange={(v) => setAgeFilter(v === ALL_VALUE ? null : v)}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Age">
              {(value: string) => (value === ALL_VALUE ? 'Any age' : value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Any age</SelectItem>
            {AGE_OPTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          {query ? 'Search results' : 'Recommended'}{' '}
          <span className="tabular-nums">{filtered.length}</span>
        </p>
        {filtered.map((voice) => {
          const isFavorite = favorites.includes(voice.id)
          const isInUse = voice.id === currentVoiceId
          const langLabel = languageOptions.find((l) => l.code === voice.language)
          return (
            <div
              key={voice.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectVoice(voice.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectVoice(voice.id)
                }
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
            >
              <VoiceOrbButton
                id={voice.id}
                playing={playingId === voice.id}
                onToggle={() => togglePreview(voice)}
                className="size-8"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{voice.label}</p>
                {voice.description && (
                  <p className="truncate text-xs text-muted-foreground">{voice.description}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {langLabel?.flag} {langLabel?.label ?? voice.language}
              </span>
              {voice.gender && (
                <span className="shrink-0 text-xs capitalize text-muted-foreground">
                  {voice.gender}
                </span>
              )}
              {voice.age && (
                <span className="shrink-0 text-xs capitalize text-muted-foreground">
                  {voice.age}
                </span>
              )}
              {isInUse && <Badge variant="outline">In use</Badge>}
              <Star
                className={`size-4 shrink-0 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void handleToggleFavorite(voice.id)
                }}
              />
            </div>
          )
        })}
      </div>

      <CreateVoiceDialog
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        onVoiceCreated={(voice) => {
          setCustomVoices((prev) => [voice, ...prev])
          setCurrentVoiceId(voice.id)
          void updateAgentGeneral(selectedAgentId, { voiceId: voice.id })
        }}
      />
    </div>
  )
}
