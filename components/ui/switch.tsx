"use client"

import { useEffect, useId, useRef, useState } from "react"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react"

import { cn } from "@/lib/utils"
import "./squish-switch.css"

const FLOW_SPRING = { stiffness: 320, damping: 40, mass: 0.6 }
const SWELL_SPRING = { stiffness: 520, damping: 34, mass: 0.6 }
const MAX_STRETCH = 0.55
const STRETCH_RATE = 7
const SQUASH = 0.7
const PRESS_STRETCH = 1.18
const HOVER_SCALE = 1.035
const SETTLE_STIFFNESS = 170
const SETTLE_DAMPING = 16
const COLOR_FADE_MS = 320
const TAP_SLOP = { fine: 4, coarse: 8 }

const SIZES = {
  default: { width: 36, height: 20 },
  sm: { width: 28, height: 16 },
}

type Grip = {
  id: number
  grab: number | null
  moved: boolean
  startX: number
  onAtPress: boolean
  slop: number
}

type SwitchProps = {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  size?: keyof typeof SIZES
  className?: string
  id?: string
  "aria-label"?: string
  "aria-labelledby"?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// Adapted from React Bits' SquishSwitch: the thumb stretches with speed and can be dragged.
function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  size = "default",
  className,
  id,
  ...aria
}: SwitchProps) {
  const reduce = useReducedMotion()
  const { width, height } = SIZES[size]
  const inset = Math.max(3, Math.round(height * 0.11))
  const thumb = height - inset * 2
  const min = inset
  const max = width - inset - thumb
  const mid = (min + max) / 2

  const isControlled = checked !== undefined
  const [inner, setInner] = useState(defaultChecked)
  const on = isControlled ? checked : inner
  const [dragging, setDragging] = useState(false)
  const trackRef = useRef<HTMLSpanElement>(null)
  const grip = useRef<Grip | null>(null)
  const onRef = useRef(on)
  const skipClick = useRef(false)
  const autoId = useId()

  useEffect(() => {
    onRef.current = on
  }, [on])

  const x = useMotionValue(on ? max : min)
  const flow = useSpring(useVelocity(x), FLOW_SPRING)
  const swell = useSpring(1, SWELL_SPRING)
  const press = useSpring(1, SWELL_SPRING)
  const topSpeed = (max - min) * STRETCH_RATE
  const stretchOf = (velocity: number) =>
    reduce ? 1 : 1 + Math.min(1, Math.abs(velocity) / topSpeed) * MAX_STRETCH
  const scaleX = useTransform([flow, swell, press], ([v, h, p]: number[]) => stretchOf(v) * h * p)
  const scaleY = useTransform(
    [flow, swell, press],
    ([v, h, p]: number[]) => h / (stretchOf(v) * p) ** SQUASH
  )

  function commit(next: boolean) {
    if (next === onRef.current) return
    onRef.current = next
    if (!isControlled) setInner(next)
    onCheckedChange?.(next)
  }

  useEffect(() => {
    if (dragging) return undefined
    const target = on ? max : min
    if (reduce) {
      x.jump(target)
      return undefined
    }
    const controls = animate(x, target, {
      type: "spring",
      stiffness: SETTLE_STIFFNESS,
      damping: SETTLE_DAMPING,
      mass: 0.9,
      restDelta: 0.001,
      restSpeed: 0.01,
    })
    return () => controls.stop()
  }, [on, dragging, min, max, reduce, x])

  function localX(clientX: number) {
    const element = trackRef.current
    if (!element) return 0
    const rect = element.getBoundingClientRect()
    const scale = rect.width / (element.offsetWidth || rect.width) || 1
    return (clientX - rect.left) / scale
  }

  function down(event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || grip.current || event.button !== 0) return
    grip.current = {
      id: event.pointerId,
      grab: null,
      moved: false,
      startX: event.clientX,
      onAtPress: onRef.current,
      slop: event.pointerType === "touch" ? TAP_SLOP.coarse : TAP_SLOP.fine,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (!reduce) press.set(PRESS_STRETCH)
    setDragging(true)
  }

  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const held = grip.current
    if (!held || held.id !== event.pointerId) return
    const position = localX(event.clientX)
    if (held.grab === null) {
      held.grab = position - x.get()
      return
    }
    if (!held.moved && Math.abs(event.clientX - held.startX) > held.slop) held.moved = true
    if (!held.moved) return
    const next = clamp(position - held.grab, min, max)
    x.set(next)
    commit(next > mid)
  }

  function release(target: HTMLButtonElement, pointerId: number, cancelled: boolean) {
    const held = grip.current
    if (!held || held.id !== pointerId) return
    grip.current = null
    press.set(1)
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId)
    if (cancelled) commit(held.onAtPress)
    else if (!held.moved) commit(!onRef.current)
    skipClick.current = true
    setTimeout(() => {
      skipClick.current = false
    }, 0)
    setDragging(false)
  }

  function click() {
    if (skipClick.current) {
      skipClick.current = false
      return
    }
    if (!disabled) commit(!onRef.current)
  }

  return (
    <button
      id={id ?? autoId}
      type="button"
      role="switch"
      data-slot="switch"
      data-size={size}
      aria-checked={on}
      aria-disabled={disabled || undefined}
      className={cn("squish-switch peer", className)}
      data-on={on ? "" : undefined}
      data-held={dragging ? "" : undefined}
      style={
        {
          "--ss-w": `${width}px`,
          "--ss-h": `${height}px`,
          "--ss-inset": `${inset}px`,
          "--ss-thumb": `${thumb}px`,
          "--ss-r": `${height / 2}px`,
          "--ss-thumb-r": `${thumb / 2}px`,
          "--ss-track": "var(--switch-track)",
          "--ss-track-on": "var(--brand)",
          "--ss-thumb-color": "#ffffff",
          "--ss-thumb-on": "#ffffff",
          "--ss-fade": `${COLOR_FADE_MS}ms`,
        } as React.CSSProperties
      }
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={(event) => release(event.currentTarget, event.pointerId, false)}
      onPointerCancel={(event) => release(event.currentTarget, event.pointerId, true)}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && !disabled) swell.set(HOVER_SCALE)
      }}
      onPointerLeave={() => swell.set(1)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && grip.current) {
          release(event.currentTarget, grip.current.id, true)
        }
      }}
      onClick={click}
      {...aria}
    >
      <span ref={trackRef} className="squish-switch__track">
        <motion.span
          data-slot="switch-thumb"
          className="squish-switch__thumb"
          aria-hidden="true"
          style={{ x, scaleX, scaleY }}
        />
      </span>
    </button>
  )
}

export { Switch }
