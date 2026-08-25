import { toStream, type voice } from '@livekit/agents'
import type { FishAudioTTS } from '@/lib/voice/adapters/fish-audio-tts'

async function collectTtsFrames(tts: FishAudioTTS, text: string) {
  const frames = []
  for await (const event of tts.synthesize(text)) {
    frames.push(event.frame)
  }
  return frames
}

type CachedAudioFrame = Awaited<ReturnType<typeof collectTtsFrames>>[number]

const ttsCache = new Map<string, CachedAudioFrame[]>()

export function buildGreetingCacheKey(
  voiceId: string,
  toneTag: string | null,
  text: string
): string {
  return `${voiceId}|${toneTag ?? ''}|${text}`
}

/** Synthesize once and reuse frames for fixed phrases like greetings. */
export async function synthesizeCachedFrames(
  tts: FishAudioTTS,
  text: string,
  cacheKey = text
): Promise<CachedAudioFrame[]> {
  const cached = ttsCache.get(cacheKey)
  if (cached) return cached

  const frames = await collectTtsFrames(tts, text)
  ttsCache.set(cacheKey, frames)
  return frames
}

export async function sayCached(
  session: voice.AgentSession,
  tts: FishAudioTTS,
  text: string
): Promise<void> {
  const frames = await synthesizeCachedFrames(tts, text)

  async function* cachedAudio() {
    for (const frame of frames) {
      yield frame
    }
  }

  await session.say(text, { audio: toStream(cachedAudio()) })
}
