'use client'

import { useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
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
import { colorTripleFor, VoiceOrbButton } from './voice-orb-button'
import type { VoiceCatalogEntry } from '@/lib/data/voice-catalog'

type VoicePickerProps = {
  voices: VoiceCatalogEntry[]
  value?: string
  onValueChange: (id: string) => void
  onSearch?: (query: string) => void
  placeholder?: string
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
                  className="flex items-center gap-2 py-1"
                >
                  <VoiceOrbButton
                    id={voice.id}
                    playing={playingId === voice.id}
                    onToggle={() => togglePreview(voice)}
                  />
                  <span className="flex-1 truncate text-sm">{voice.label}</span>
                  <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px] font-normal">
                    {voice.language}
                  </Badge>
                  {voice.id === value && <Check className="size-3.5 shrink-0 text-foreground" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
