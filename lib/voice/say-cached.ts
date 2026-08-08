import type { AudioFrame } from '@livekit/rtc-node'
import { toStream, type voice } from '@livekit/agents'
import type { FishAudioTTS } from '@/lib/voice/adapters/fish-audio-tts'

const ttsCache = new Map<string, AudioFrame[]>()

/** Synthesize once and reuse frames for fixed phrases like greetings. */
export async function synthesizeCachedFrames(
  tts: FishAudioTTS,
  text: string
): Promise<AudioFrame[]> {
  const cached = ttsCache.get(text)
  if (cached) return cached

  const frames: AudioFrame[] = []
  const stream = tts.synthesize(text)
  for await (const event of stream) {
    frames.push(event.frame)
  }
  ttsCache.set(text, frames)
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
