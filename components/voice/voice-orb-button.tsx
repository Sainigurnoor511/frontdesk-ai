'use client'

import { Play, Pause } from 'lucide-react'

export function colorTripleFor(id: string): [string, string, string] {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const hue = Math.abs(hash) % 360
  return [
    `hsl(${hue}, 80%, 60%)`,
    `hsl(${(hue + 45) % 360}, 75%, 50%)`,
    `hsl(${(hue + 20) % 360}, 60%, 30%)`,
  ]
}

export function VoiceOrbButton({
  id,
  playing,
  onToggle,
  className = 'size-5',
}: {
  id: string
  playing: boolean
  onToggle: () => void
  className?: string
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
      className={`group relative shrink-0 overflow-hidden rounded-full ${className}`}
      style={{
        background: `radial-gradient(circle at 30% 30%, ${c1}, ${c2} 55%, ${c3} 100%)`,
      }}
    >
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
        {playing ? (
          <Pause className="size-2.5 fill-white text-white" />
        ) : (
          <Play className="size-2.5 fill-white text-white" />
        )}
      </span>
      {playing && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Pause className="size-2.5 fill-white text-white" />
        </span>
      )}
    </button>
  )
}
