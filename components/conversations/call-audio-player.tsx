'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Undo2,
  Redo2,
  MoreHorizontal,
  Download,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TranscriptMessage } from '@/lib/data/conversations'
import { formatTranscriptForCopy } from '@/lib/conversations/display'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEEDS = [1, 1.5, 2, 0.5] as const
const BAR_COUNT = 140

async function decodeWaveformPeaks(recordingUrl: string): Promise<number[]> {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioContext = new AudioContextCtor()

  try {
    const response = await fetch(recordingUrl)
    const buffer = await response.arrayBuffer()
    const decoded = await audioContext.decodeAudioData(buffer)
    const channelData = decoded.getChannelData(0)
    const blockSize = Math.max(1, Math.floor(channelData.length / BAR_COUNT))
    const peaks: number[] = []

    for (let i = 0; i < BAR_COUNT; i++) {
      let peak = 0
      const start = i * blockSize
      const end = Math.min(channelData.length, start + blockSize)
      for (let j = start; j < end; j++) {
        peak = Math.max(peak, Math.abs(channelData[j]))
      }
      peaks.push(peak)
    }

    const max = Math.max(...peaks, 0.0001)
    return peaks.map((value) => value / max)
  } finally {
    await audioContext.close()
  }
}

export function CallAudioPlayer({
  recordingUrl,
  durationSeconds,
  transcript,
  agentName,
  downloadFilename,
  showWaveform = true,
}: {
  recordingUrl: string | null
  durationSeconds: number
  transcript: TranscriptMessage[]
  agentName: string
  downloadFilename?: string
  showWaveform?: boolean
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [isDecoding, setIsDecoding] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(durationSeconds)
  const [speedIndex, setSpeedIndex] = useState(0)

  useEffect(() => {
    if (!recordingUrl) {
      setPeaks(null)
      setIsDecoding(false)
      return
    }

    let cancelled = false
    setIsDecoding(true)

    decodeWaveformPeaks(recordingUrl)
      .then((computed) => {
        if (!cancelled) setPeaks(computed)
      })
      .catch((err) => {
        console.error('[call-audio-player] failed to decode audio for waveform:', err)
        if (!cancelled) setPeaks(null)
      })
      .finally(() => {
        if (!cancelled) setIsDecoding(false)
      })

    return () => {
      cancelled = true
    }
  }, [recordingUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !showWaveform) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const width = container.clientWidth
      const height = 44
      canvas.width = width
      canvas.height = height

      const bars =
        peaks ??
        Array.from({ length: BAR_COUNT }, (_, i) => 0.15 + ((i * 11) % 17) / 40)
      const barWidth = width / bars.length
      const progress = duration > 0 ? currentTime / duration : 0

      ctx.clearRect(0, 0, width, height)

      bars.forEach((value, i) => {
        const barHeight = Math.max(2, value * (height - 8))
        const played = i / bars.length < progress
        ctx.fillStyle = played ? '#737373' : '#d4d4d4'
        const x = i * barWidth
        const w = Math.max(1, barWidth * 0.55)
        ctx.fillRect(x + (barWidth - w) / 2, (height - barHeight) / 2, w, barHeight)
      })

      if (progress > 0 && progress < 1) {
        const playheadX = progress * width
        ctx.strokeStyle = '#171717'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(playheadX, 4)
        ctx.lineTo(playheadX, height - 4)
        ctx.stroke()
      }
    }

    draw()

    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [peaks, currentTime, duration, showWaveform])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || !recordingUrl) return
    if (isPlaying) {
      audio.pause()
      return
    }
    void audio.play().catch((err) => {
      console.error('[call-audio-player] play failed:', err)
      toast.error('Could not play recording. Try downloading the audio instead.')
    })
  }

  function seekBy(deltaSeconds: number) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + deltaSeconds))
  }

  function cycleSpeed() {
    const nextIndex = (speedIndex + 1) % SPEEDS.length
    setSpeedIndex(nextIndex)
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[nextIndex]
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const audio = audioRef.current
    if (!audio || duration <= 0 || !recordingUrl) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audio.currentTime = ratio * duration
  }

  async function handleCopyTranscript() {
    if (transcript.length === 0) {
      toast.error('No transcript to copy.')
      return
    }
    await navigator.clipboard.writeText(formatTranscriptForCopy(transcript, agentName))
    toast.success('Transcript copied.')
  }

  function handleDownload() {
    if (!recordingUrl) return
    const link = document.createElement('a')
    link.href = recordingUrl
    link.download = downloadFilename ?? 'call-recording.ogg'
    link.click()
  }

  const controlsDisabled = !recordingUrl

  if (!showWaveform) return null

  return (
    <div className="space-y-3">
      {recordingUrl && (
        <audio
          ref={audioRef}
          src={recordingUrl}
          crossOrigin="anonymous"
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div ref={containerRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`h-11 w-full ${controlsDisabled ? '' : 'cursor-pointer'}`}
        />
        {isDecoding && (
          <p className="absolute inset-x-0 bottom-0 text-center text-[10px] text-muted-foreground">
            Loading waveform…
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="icon"
            className="size-9 rounded-full"
            disabled={controlsDisabled}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </Button>
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={cycleSpeed}
            className="text-sm text-muted-foreground disabled:opacity-50"
          >
            {SPEEDS[speedIndex].toFixed(1)}x
          </button>
          <Undo2
            role="button"
            aria-label="Rewind 5 seconds"
            className={`size-4 ${controlsDisabled ? 'text-muted-foreground/40' : 'cursor-pointer text-muted-foreground hover:text-foreground'}`}
            onClick={controlsDisabled ? undefined : () => seekBy(-5)}
          />
          <Redo2
            role="button"
            aria-label="Fast forward 10 seconds"
            className={`size-4 ${controlsDisabled ? 'text-muted-foreground/40' : 'cursor-pointer text-muted-foreground hover:text-foreground'}`}
            onClick={controlsDisabled ? undefined : () => seekBy(10)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" className="size-8" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!recordingUrl} onClick={handleDownload}>
                <Download />
                Download audio
              </DropdownMenuItem>
              <DropdownMenuItem disabled={transcript.length === 0} onClick={() => void handleCopyTranscript()}>
                <Copy />
                Copy transcript
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!recordingUrl && (
        <p className="text-xs text-muted-foreground">
          Recording is not available for this conversation yet.
        </p>
      )}
    </div>
  )
}
