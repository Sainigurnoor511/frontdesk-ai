'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { AgentState, OrbProps } from './orb-types'

export type { AgentState, OrbProps } from './orb-types'

const FRAME_INTERVAL_MS = 1000 / 30

function gridSizeFor(pixels: number): number {
  const cells = Math.round(pixels / 11)
  const clamped = Math.max(5, Math.min(17, cells))
  return clamped % 2 === 0 ? clamped + 1 : clamped
}

// How full each dot is (0 to 1) for a given state, distance from centre, angle and time.
function dotLevel(state: AgentState, distance: number, angle: number, time: number): number {
  if (state === 'talking') {
    return 0.55 + 0.45 * Math.sin(distance * 9 - time * 7)
  }
  if (state === 'listening') {
    return 0.5 + 0.4 * Math.sin(distance * 7 + time * 4)
  }
  if (state === 'thinking') {
    const sweep = Math.cos(angle - time * 2.6)
    return 0.3 + 0.7 * Math.max(0, sweep) ** 2
  }
  return 0.6 + 0.3 * Math.sin(distance * 5 - time * 1.1)
}

export function Orb({ size, className, agentState = null, colors }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<AgentState>(agentState)

  useEffect(() => {
    stateRef.current = agentState
  }, [agentState])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let lastDraw = 0
    let dotColor = ''
    let accentColor = ''

    function readColors() {
      const styles = getComputedStyle(canvas!)
      dotColor = colors?.[0] ?? styles.color
      accentColor = colors?.[1] ?? (styles.getPropertyValue('--brand').trim() || styles.color)
    }

    function draw(now: number) {
      const box = canvas!.getBoundingClientRect()
      const pixels = Math.min(box.width, box.height)
      if (pixels === 0) return

      const ratio = window.devicePixelRatio || 1
      const side = Math.round(pixels * ratio)
      if (canvas!.width !== side || canvas!.height !== side) {
        canvas!.width = side
        canvas!.height = side
        readColors()
      }

      const grid = gridSizeFor(pixels)
      const pitch = side / grid
      const centre = (grid - 1) / 2
      const time = reduceMotion ? 0 : now / 1000
      const state = stateRef.current

      context!.clearRect(0, 0, side, side)
      for (let row = 0; row < grid; row++) {
        for (let column = 0; column < grid; column++) {
          const dx = (column - centre) / (grid / 2)
          const dy = (row - centre) / (grid / 2)
          const distance = Math.hypot(dx, dy)
          if (distance > 0.96) continue

          const level = dotLevel(state, distance, Math.atan2(dy, dx), time)
          const radius = (pitch / 2) * (0.28 + 0.66 * level)
          context!.fillStyle = state !== null && level > 0.82 ? accentColor : dotColor
          context!.beginPath()
          context!.arc((column + 0.5) * pitch, (row + 0.5) * pitch, radius, 0, Math.PI * 2)
          context!.fill()
        }
      }
    }

    function loop(now: number) {
      frame = requestAnimationFrame(loop)
      if (now - lastDraw < FRAME_INTERVAL_MS) return
      lastDraw = now
      draw(now)
    }

    readColors()
    draw(0)
    if (!reduceMotion) frame = requestAnimationFrame(loop)

    const themeObserver = new MutationObserver(readColors)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      cancelAnimationFrame(frame)
      themeObserver.disconnect()
    }
  }, [colors])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-slot="orb"
      className={cn('block text-foreground', !size && 'h-full w-full', className)}
      style={size ? { width: size, height: size } : undefined}
    />
  )
}
