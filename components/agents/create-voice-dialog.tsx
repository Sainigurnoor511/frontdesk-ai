'use client'

import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VoiceOrbButton } from '@/components/voice/voice-orb-button'
import { languageOptions } from '@/lib/data/voice-catalog'
import {
  designVoiceCandidates,
  saveVoiceModel,
} from '@/app/(dashboard)/agents/[id]/actions'

type Candidate = { audioBase64: string; id: string }
type CreatedVoice = { id: string; label: string; language: string; previewUrl: string }

export function CreateVoiceDialog({
  open,
  onOpenChange,
  onVoiceCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVoiceCreated: (voice: CreatedVoice) => void
}) {
  const [instruction, setInstruction] = useState('')
  const [language, setLanguage] = useState('en')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [savingCandidateId, setSavingCandidateId] = useState<string | null>(null)
  const [nameForCandidateId, setNameForCandidateId] = useState<string | null>(null)
  const [voiceName, setVoiceName] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function reset() {
    setInstruction('')
    setCandidates([])
    setError(null)
    setNameForCandidateId(null)
    setVoiceName('')
  }

  async function handleGenerate() {
    setError(null)
    setGenerating(true)
    const result = await designVoiceCandidates(instruction, language)
    setGenerating(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setCandidates(result.candidates.map((c, i) => ({ ...c, id: `candidate-${i}` })))
  }

  function togglePreview(candidate: Candidate) {
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    if (playingId === candidate.id) {
      audio.pause()
      setPlayingId(null)
      return
    }
    audio.pause()
    audio.src = `data:audio/mpeg;base64,${candidate.audioBase64}`
    void audio.play()
    setPlayingId(candidate.id)
    audio.onended = () => setPlayingId(null)
  }

  async function handleSave(candidate: Candidate) {
    if (!voiceName.trim()) return
    setSavingCandidateId(candidate.id)
    setError(null)
    const result = await saveVoiceModel(candidate.audioBase64, voiceName.trim(), language)
    setSavingCandidateId(null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onVoiceCreated({ id: result.id, label: voiceName.trim(), language, previewUrl: '' })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a voice</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Describe the voice you want..."
            rows={3}
          />
          <Select value={language} onValueChange={(value) => setLanguage(value ?? 'en')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a language">
                {(value: string) => {
                  const lang = languageOptions.find((l) => l.code === value)
                  return lang ? `${lang.flag} ${lang.label}` : 'Select a language'
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.flag} {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={!instruction.trim() || generating}
          >
            {generating ? 'Generating...' : 'Generate'}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {candidates.length > 0 && (
            <div className="space-y-2">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="flex items-center gap-3 rounded-lg border p-2">
                  <VoiceOrbButton
                    id={candidate.id}
                    playing={playingId === candidate.id}
                    onToggle={() => togglePreview(candidate)}
                  />
                  {nameForCandidateId === candidate.id ? (
                    <>
                      <Input
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value)}
                        placeholder="Name this voice"
                        className="flex-1"
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!voiceName.trim() || savingCandidateId === candidate.id}
                        onClick={() => handleSave(candidate)}
                      >
                        {savingCandidateId === candidate.id ? 'Saving...' : 'Save'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setNameForCandidateId(candidate.id)}
                    >
                      Use this voice
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
