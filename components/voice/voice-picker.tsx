'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Play, Pause } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import type { VoiceCatalogEntry } from '@/lib/data/voice-catalog'

type VoicePickerProps = {
  voices: VoiceCatalogEntry[]
  value?: string
  onValueChange: (id: string) => void
  onSearch?: (query: string) => void
  placeholder?: string
}

function colorTripleFor(id: string): [string, string, string] {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const hue = Math.abs(hash) % 360
  return [
    `hsl(${hue}, 80%, 60%)`,
    `hsl(${(hue + 45) % 360}, 75%, 50%)`,
    `hsl(${(hue + 20) % 360}, 60%, 30%)`,
  ]
}

function VoiceOrbButton({
  id,
  playing,
  onToggle,
}: {
  id: string
  playing: boolean
  onToggle: () => void
}) {
  const [c1, c2, c3] = colorTripleFor(id)
  return (
    <button
      type="button"
      aria-label={playing ? 'Pause preview' : 'Play preview'}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="group relative size-6 shrink-0 overflow-hidden rounded-full"
      style={{
        background: `radial-gradient(circle at 30% 30%, ${c1}, ${c2} 55%, ${c3} 100%)`,
      }}
    >
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
        {playing ? (
          <Pause className="size-3 fill-white text-white" />
        ) : (
          <Play className="size-3 fill-white text-white" />
        )}
      </span>
      {playing && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Pause className="size-3 fill-white text-white" />
        </span>
      )}
    </button>
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
  const selectedColors = selected ? colorTripleFor(selected.id) : null

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
        {selected && selectedColors ? (
          <>
            <span
              className="size-6 shrink-0 rounded-full"
              style={{ background: `radial-gradient(circle at 30% 30%, ${selectedColors[0]}, ${selectedColors[1]} 55%, ${selectedColors[2]} 100%)` }}
            />
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
            <CommandGroup heading="Recommended">
              {filtered.map((voice) => (
                <CommandItem
                  key={voice.id}
                  value={voice.id}
                  onSelect={() => {
                    onValueChange(voice.id)
                    setOpen(false)
                  }}
                  className="flex items-center gap-3"
                >
                  <VoiceOrbButton
                    id={voice.id}
                    playing={playingId === voice.id}
                    onToggle={() => togglePreview(voice)}
                  />
                  <span className="flex-1 truncate">{voice.label}</span>
                  <Badge variant="outline" className="rounded-full px-2 text-xs font-normal">
                    {voice.language}
                  </Badge>
                  {voice.id === value && <Check className="size-4 shrink-0 text-foreground" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
