'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe2, Sparkles, Star, Timer } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  FilterMenuButton,
  FilterToggleButton,
} from '@/components/layout/filter-menu-button'
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
  previewVoice,
  type VoiceSearchResult,
} from './actions'
import type { AgentDetail } from '@/lib/data/agents'

const GENDER_OPTIONS = ['male', 'female'] as const
const AGE_OPTIONS = ['young', 'middle-aged', 'old'] as const
const ALL_VALUE = '__all'

export function VoicesTab({
  agent,
  createOpen,
  onCreateOpenChange,
}: {
  agent: AgentDetail
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
}) {
  const [currentVoiceId, setCurrentVoiceId] = useState(agent.voice_id ?? '')
  const [customVoices, setCustomVoices] = useState<VoiceSearchResult[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VoiceSearchResult[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [languageFilter, setLanguageFilter] = useState<string | null>(null)
  const [genderFilter, setGenderFilter] = useState<string | null>(null)
  const [ageFilter, setAgeFilter] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    setCurrentVoiceId(agent.voice_id ?? '')
  }, [agent.id, agent.voice_id])

  useEffect(() => {
    void getFavoriteVoiceIds().then(setFavorites)
    void getCustomVoices().then(setCustomVoices)
  }, [])

  useEffect(() => {
    if (!query) return
    const timeout = setTimeout(() => {
      void searchVoices(query, languageFilter ?? undefined).then(setResults)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, languageFilter])

  const baseList: VoiceSearchResult[] = query ? results : [...customVoices, ...voiceCatalog]
  const filtered = baseList
    .filter((voice) => {
      if (languageFilter && voice.language !== languageFilter) return false
      if (genderFilter && voice.gender !== genderFilter) return false
      if (ageFilter && voice.age !== ageFilter) return false
      if (favoritesOnly && !favorites.includes(voice.id)) return false
      return true
    })

  const currentVoice = [...customVoices, ...voiceCatalog, ...results].find(
    (v) => v.id === currentVoiceId
  )

  async function togglePreview(voice: VoiceCatalogEntry) {
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    if (playingId === voice.id) {
      audio.pause()
      setPlayingId(null)
      return
    }

    let src = voice.previewUrl || previewCache[voice.id]
    if (!src) {
      setPreviewLoadingId(voice.id)
      const result = await previewVoice(voice.id)
      setPreviewLoadingId(null)
      if ('error' in result) return
      src = `data:audio/mpeg;base64,${result.audioBase64}`
      setPreviewCache((prev) => ({ ...prev, [voice.id]: src }))
    }

    audio.pause()
    audio.src = src
    audio.onended = () => setPlayingId(null)
    void audio.play()
    setPlayingId(voice.id)
  }

  async function handleSelectVoice(voiceId: string) {
    setCurrentVoiceId(voiceId)
    await updateAgentGeneral(agent.id, { voiceId })
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
        <FilterMenuButton icon={Globe2} label="Language" active={languageFilter !== null}>
          <DropdownMenuItem onClick={() => setLanguageFilter(null)}>All languages</DropdownMenuItem>
          {languageOptions.map((lang) => (
            <DropdownMenuItem key={lang.code} onClick={() => setLanguageFilter(lang.code)}>
              {lang.flag} {lang.label}
            </DropdownMenuItem>
          ))}
        </FilterMenuButton>

        <FilterMenuButton icon={Sparkles} label="Gender" active={genderFilter !== null}>
          <DropdownMenuItem onClick={() => setGenderFilter(null)}>Any gender</DropdownMenuItem>
          {GENDER_OPTIONS.map((g) => (
            <DropdownMenuItem key={g} onClick={() => setGenderFilter(g)}>
              {g}
            </DropdownMenuItem>
          ))}
        </FilterMenuButton>

        <FilterMenuButton icon={Timer} label="Age" active={ageFilter !== null}>
          <DropdownMenuItem onClick={() => setAgeFilter(null)}>Any age</DropdownMenuItem>
          {AGE_OPTIONS.map((a) => (
            <DropdownMenuItem key={a} onClick={() => setAgeFilter(a)}>
              {a}
            </DropdownMenuItem>
          ))}
        </FilterMenuButton>

        <FilterToggleButton
          icon={Star}
          label="Favorites"
          active={favoritesOnly}
          onClick={() => setFavoritesOnly((prev) => !prev)}
        />
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
                onToggle={() => void togglePreview(voice)}
                className={`size-8 ${previewLoadingId === voice.id ? 'opacity-50' : ''}`}
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
          void updateAgentGeneral(agent.id, { voiceId: voice.id })
        }}
      />
    </div>
  )
}
