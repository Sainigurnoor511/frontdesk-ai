'use client'

import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import type { OrbProps } from './orb-types'

export type { AgentState, OrbProps } from './orb-types'

/**
 * Lazy boundary for the WebGL orb.
 *
 * The implementation pulls in `three`, `@react-three/fiber`, and
 * `@react-three/drei`, which together dominated the largest client chunk
 * (~883 KB alongside livekit and rive). The orb is decorative on two of its three
 * call sites — a 16px sidebar glyph and a 44px avatar — so paying for a 3D engine
 * before first paint was a bad trade.
 *
 * Deferring it means `three` lands in its own chunk fetched after hydration
 * instead of in the initial shared bundle.
 *
 * This file must not import anything that reaches `three`, or the split
 * collapses and the lazy chunk is pulled back into the parent. That is why the
 * prop types live in `orb-types.ts`.
 *
 * `ssr: false` because WebGL can't render on the server anyway; the previous
 * implementation also read `document` during setup.
 */
const OrbCanvas = dynamic(() => import('./orb-canvas').then((m) => m.OrbCanvas), {
  ssr: false,
  // Reserves the exact footprint so lazy-loading doesn't shift layout when the
  // canvas arrives.
  loading: () => null,
})

export function Orb({ size, className, ...props }: OrbProps) {
  return (
    <div
      className={cn('relative', !size && 'h-full w-full', className)}
      style={size ? { width: size, height: size } : undefined}
    >
      <OrbCanvas size={size} {...props} />
    </div>
  )
}
