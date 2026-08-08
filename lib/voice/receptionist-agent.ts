import { Agent, type AgentOptions } from '@livekit/agents'
import type { FishAudioTTS } from '@/lib/voice/adapters/fish-audio-tts'
import { sayCached } from '@/lib/voice/say-cached'

type ReceptionistAgentOptions = {
  instructions: string
  tools: NonNullable<AgentOptions['tools']>
  greetingText: string
  tts: FishAudioTTS
}

/**
 * Voice agent that greets the caller as soon as the session starts using
 * pre-synthesized (cached) TTS for minimal time-to-first-audio.
 */
export function createReceptionistAgent({
  instructions,
  tools,
  greetingText,
  tts,
}: ReceptionistAgentOptions): Agent {
  class ReceptionistAgent extends Agent {
    async onEnter(): Promise<void> {
      await sayCached(this.session, tts, greetingText)
    }
  }

  return new ReceptionistAgent({ instructions, tools })
}
