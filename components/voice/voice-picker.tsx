'use client'

import { useMemo, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import type { VoiceCatalogEntry } from '@/lib/data/voice-catalog'

type VoicePickerProps = {
  voices: VoiceCatalogEntry[]
  value?: string
  onValueChange: (id: string) => void
  onSearch?: (query: string) => void
  placeholder?: string
}

function colorPairFor(id: string): [string, string] {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const hue = Math.abs(hash) % 360
  return [`hsl(${hue}, 70%, 55%)`, `hsl(${(hue + 40) % 360}, 70%, 65%)`]
}

function VoiceAvatar({ id }: { id: string }) {
  const [c1, c2] = colorPairFor(id)
  return (
    <div
      className="size-6 shrink-0 rounded-full"
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
    />
  )
}

export function VoicePicker({
  voices,
  value,
  onValueChange,
  onSearch,
  placeholder = 'Select a voice...',
}: VoicePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const filtered = useMemo(
    () => voices.filter((voice) => voice.label.toLowerCase().includes(query.toLowerCase())),
    [voices, query]
  )

  const selected = voices.find((voice) => voice.id === value)

  function togglePreview(voice: VoiceCatalogEntry) {
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const audio = audioRef.current

    if (playingId === voice.id) {
      audio.pause()
      setPlayingId(null)
      return
    }

    audio.pause()
    audio.src = voice.previewUrl
    void audio.play()
    setPlayingId(voice.id)
    audio.onended = () => setPlayingId(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" role="combobox" className="w-full justify-start gap-2" />}
      >
        {selected ? (
          <>
            <VoiceAvatar id={selected.id} />
            {selected.label}
          </>
        ) : (
          placeholder
        )}
      </PopoverTrigger>
      <PopoverContent className="w-full max-w-none p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={(next) => {
              setQuery(next)
              onSearch?.(next)
            }}
            placeholder="Search voices..."
          />
          <CommandList>
            <CommandEmpty>No voices found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((voice) => (
                <CommandItem
                  key={voice.id}
                  value={voice.id}
                  onSelect={() => {
                    onValueChange(voice.id)
                    setOpen(false)
                  }}
                  className="flex items-center gap-2"
                >
                  <VoiceAvatar id={voice.id} />
                  <span className="flex-1">{voice.label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={playingId === voice.id ? 'Pause preview' : 'Play preview'}
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePreview(voice)
                    }}
                  >
                    {playingId === voice.id ? (
                      <Pause className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </Button>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
