import { config } from 'dotenv'
config({ path: '.env.local' })

import * as agents from '@livekit/agents'
import { initVad } from '@livekit/local-inference'
import { LLM as OpenAILLM, STT as OpenAISTT } from '@livekit/agents-plugin-openai'
import { FishAudioTTS } from '@/lib/voice/adapters/fish-audio-tts'
import { buildDefaultFirstMessage, buildSystemPrompt, buildToneTag } from '@/lib/voice/agent-context'
import { createReceptionistAgent } from '@/lib/voice/receptionist-agent'
import { synthesizeCachedFrames } from '@/lib/voice/say-cached'
import { buildBookingTools } from '@/lib/voice/booking-tools'
import { buildKnowledgeTools } from '@/lib/voice/knowledge-tools'
import { defaultVoiceIdForLanguage } from '@/lib/data/voice-catalog'
import { resolveGroqModel } from '@/lib/data/agent-advanced-options'
import { getAgentByIdServiceRole } from '@/lib/data/agents-service'
import { updateConversationStatus } from '@/lib/data/conversations-service'
import { CallTranscriptCollector } from '@/lib/voice/call-transcript-collector'
import { generateCallSummary } from '@/lib/voice/generate-call-summary'

/**
 * JSON payload set on the LiveKit room's metadata at creation time by
 * `startDashboardCall`/`startPublicCall` (see `app/(dashboard)/actions/voice.ts`
 * and `app/smb/actions.ts`), via `RoomServiceClient.createRoom({ metadata })`.
 * Room metadata is preferred over cramming identifiers into the room name —
 * room names stay simple opaque identifiers (`${organizationId}:call:${uuid}`).
 */
type RoomMetadata = {
  agentId: string
  conversationId: string
}

const MAX_CALL_SECONDS = 300

function parseRoomMetadata(raw: string | undefined): RoomMetadata | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.agentId === 'string' &&
      typeof parsed.conversationId === 'string'
    ) {
      return parsed as RoomMetadata
    }
    return null
  } catch {
    return null
  }
}

function describeSessionEvent(ev: unknown): string {
  if (!ev || typeof ev !== 'object') return String(ev)
  const record = ev as Record<string, unknown>
  const parts: string[] = []
  if ('reason' in record) parts.push(`reason=${String(record.reason)}`)
  if ('source' in record) parts.push(`source=${String(record.source)}`)
  if ('type' in record) parts.push(`type=${String(record.type)}`)
  if ('error' in record && record.error) {
    const err = record.error
    parts.push(
      `error=${err instanceof Error ? err.message : JSON.stringify(err)}`
    )
  }
  if (parts.length > 0) return parts.join(', ')
  try {
    return JSON.stringify(ev)
  } catch {
    return String(ev)
  }
}

async function entrypoint(ctx: agents.JobContext) {
  const metadata = parseRoomMetadata(ctx.room.metadata)
  if (!metadata) {
    await ctx.connect()
    console.error(`[voice-agent] room ${ctx.room.name} has no valid metadata; disconnecting`)
    await ctx.room.disconnect()
    return
  }

  const { agentId, conversationId } = metadata

  const startedAt = Date.now()
  let finished = false
  let organizationId: string | undefined
  let businessName: string | null | undefined
  let maxDurationTimer: NodeJS.Timeout | undefined
  const transcriptCollector = new CallTranscriptCollector(startedAt)

  const finalizeConversation = async (status: 'completed' | 'failed', endedReason?: string) => {
    if (finished) return
    finished = true
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer)
      maxDurationTimer = undefined
    }
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000)
    const transcript = transcriptCollector.getMessages()

    let summary: string | undefined
    if (transcript.length > 0) {
      try {
        const generated = await generateCallSummary(transcript, { businessName })
        if (generated) summary = generated
      } catch (err) {
        console.error(
          `[voice-agent] summary generation failed for conversation ${conversationId}:`,
          err
        )
      }
    }

    try {
      await updateConversationStatus(
        conversationId,
        {
          status,
          outcome: status === 'completed' ? 'successful' : 'failed',
          durationSeconds,
          transcript,
          ...(summary ? { summary } : {}),
          ...(endedReason ? { endedReason } : {}),
        },
        organizationId
      )
    } catch (err) {
      console.error(`[voice-agent] failed to update conversation ${conversationId} status:`, err)
    }
  }

  try {
    const [, agentDetail] = await Promise.all([
      ctx.connect(),
      getAgentByIdServiceRole(agentId),
    ])

    if (!agentDetail) {
      console.error(`[voice-agent] agent ${agentId} not found; failing conversation ${conversationId}`)
      await finalizeConversation('failed', 'agent_not_found')
      await ctx.room.disconnect()
      return
    }

    organizationId = agentDetail.organization_id
    businessName = agentDetail.business_name ?? agentDetail.name

    const voiceId = agentDetail.voice_id ?? defaultVoiceIdForLanguage(agentDetail.language)
    const toneTag = buildToneTag(agentDetail.tone_traits)
    const groqModel = resolveGroqModel(agentDetail.llm_model)
    const tts = new FishAudioTTS(voiceId, { tag: toneTag })
    const greetingText =
      agentDetail.first_message?.trim() || buildDefaultFirstMessage(agentDetail)

    // Warm greeting audio while the session spins up so onEnter can play immediately.
    void synthesizeCachedFrames(tts, greetingText).catch((err) => {
      console.warn('[voice-agent] failed to prewarm greeting TTS:', err)
    })

    const session = new agents.AgentSession({
      stt: OpenAISTT.withGroq(),
      llm: OpenAILLM.withGroq({ model: groqModel }),
      tts,
      vad: new agents.inference.VAD({
        model: 'silero',
        minSpeechDuration: 120,
        minSilenceDuration: 350,
        prefixPaddingDuration: 500,
      }),
      turnHandling: {
        turnDetection: 'vad',
        endpointing: { minDelay: 300, maxDelay: 2500 },
        interruption: { mode: 'vad', minDuration: 400 },
      },
      // Web calls don't need a long AEC warmup — keep it short so the greeting isn't delayed.
      aecWarmupDuration: 800,
    })

    transcriptCollector.attach(session)

    ctx.room.on('disconnected', () => {
      void finalizeConversation('completed')
    })

    session.on(agents.AgentSessionEventTypes.Error, (ev) => {
      console.error(
        `[voice-agent] session error for conversation ${conversationId} (${describeSessionEvent(ev)})`
      )
      void finalizeConversation('failed', 'session_error')
    })

    session.on(agents.AgentSessionEventTypes.Close, (ev) => {
      if (ev.error) {
        console.error(
          `[voice-agent] session closed with error for conversation ${conversationId} (${describeSessionEvent(ev)})`
        )
        void finalizeConversation('failed', 'session_closed_with_error')
      } else {
        console.info(
          `[voice-agent] session closed for conversation ${conversationId} (${describeSessionEvent(ev)})`
        )
        void finalizeConversation('completed')
      }
      void ctx.room.disconnect()
    })

    ctx.addShutdownCallback(async () => {
      await finalizeConversation('completed')
    })

    const knowledgeTools = agentDetail.skip_knowledge_retrieval
      ? {}
      : buildKnowledgeTools({ organizationId: agentDetail.organization_id })

    await session.start({
      room: ctx.room,
      agent: createReceptionistAgent({
        instructions: buildSystemPrompt(agentDetail),
        tools: {
          ...buildBookingTools({
            organizationId: agentDetail.organization_id,
            agentId,
            conversationId,
          }),
          ...knowledgeTools,
        },
        greetingText,
        tts,
      }),
    })

    maxDurationTimer = setTimeout(() => {
      void finalizeConversation('completed', 'max_duration')
      void ctx.room.disconnect()
    }, MAX_CALL_SECONDS * 1000)
  } catch (error) {
    console.error(`[voice-agent] entrypoint failed for conversation ${conversationId}:`, error)
    await finalizeConversation('failed', 'internal_error')
    await ctx.room.disconnect()
  }
}

export default agents.defineAgent({
  entry: entrypoint,
  prewarm: () => {
    try {
      initVad()
      console.info('[voice-agent] Silero VAD model prewarmed')
    } catch (err) {
      console.warn('[voice-agent] failed to prewarm Silero VAD model:', err)
    }
  },
})

agents.cli.runApp(
  new agents.WorkerOptions({
    agent: import.meta.filename,
    initializeProcessTimeout: 60_000,
    numIdleProcesses: 2,
  })
)
