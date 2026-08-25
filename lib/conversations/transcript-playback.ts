import type { TranscriptMessage } from '@/lib/data/conversations'

/** Index of the transcript line active at `currentTimeSeconds` (last line whose timestamp has passed). */
export function getActiveTranscriptIndex(
  transcript: TranscriptMessage[],
  currentTimeSeconds: number
): number {
  if (transcript.length === 0) return -1

  let active = 0
  for (let i = 0; i < transcript.length; i++) {
    if (currentTimeSeconds >= transcript[i].timestampSeconds) {
      active = i
    } else {
      break
    }
  }
  return active
}
