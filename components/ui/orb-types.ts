/**
 * Types for the orb, kept separate from both the wrapper and the WebGL
 * implementation so importing them doesn't pull in `three`.
 *
 * `components/ui/orb.tsx` needs these at module scope to type its props, and it
 * must stay free of any `three` import — that's the whole point of the lazy
 * boundary (see the note in that file).
 */
export type AgentState = null | 'thinking' | 'listening' | 'talking'

export type OrbProps = {
  colors?: [string, string]
  colorsRef?: React.RefObject<[string, string]>
  resizeDebounce?: number
  seed?: number
  agentState?: AgentState
  volumeMode?: 'auto' | 'manual'
  manualInput?: number
  manualOutput?: number
  inputVolumeRef?: React.RefObject<number>
  outputVolumeRef?: React.RefObject<number>
  getInputVolume?: () => number
  getOutputVolume?: () => number
  /** Display size in CSS pixels. Canvas buffer uses 1.25× for crisp rendering (192 → 240). */
  size?: number
  className?: string
}
