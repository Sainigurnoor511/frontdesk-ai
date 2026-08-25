import { config } from 'dotenv'
config({ path: '.env.local' })

import * as agents from '@livekit/agents'
import { initVad } from '@livekit/local-inference'
import { LLM as OpenAILLM, STT as OpenAISTT } from '@livekit/agents-plugin-openai'
import { FishAudioTTS } from '@/lib/voice/adapters/fish-audio-tts'
import { buildDefaultFirstMessage, buildSystemPrompt, buildToneTag } from '@/lib/voice/agent-context'
import { createReceptionistAgent } from '@/lib/voice/receptionist-agent'
import { buildGreetingCacheKey, synthesizeCachedFrames } from '@/lib/voice/say-cached'
import { buildBookingTools } from '@/lib/voice/booking-tools'
import { buildKnowledgeTools } from '@/lib/voice/knowledge-tools'
import { defaultVoiceIdForLanguage } from '@/lib/data/voice-catalog'
import { resolveGroqModel } from '@/lib/data/agent-advanced-options'
import { getAgentByIdCached } from '@/lib/data/agents-service'
import { getConversationContextByRoomName, updateConversationStatus } from '@/lib/data/conversations-service'
import { CallTranscriptCollector } from '@/lib/voice/call-transcript-collector'
import { generateCallSummary } from '@/lib/voice/generate-call-summary'
import { parseVoiceRoomMetadata } from '@/lib/voice/room-metadata'
import { startCallRecording } from '@/lib/voice/recording'
import {
  attachVoiceSessionMetrics,
  logVoiceStartupLatency,
} from '@/lib/voice/session-metrics'

type RoomMetadata = {
  agentId: string
  conversationId: string
}

type VoiceWorkerUserData = {
  vad?: agents.inference.VAD
}

const MAX_CALL_SECONDS = 300

const VAD_OPTIONS = {
  model: 'silero' as const,
  minSpeechDuration: 120,
  minSilenceDuration: 350,
  prefixPaddingDuration: 500,
}

function createSessionVad(proc: agents.JobProcess<VoiceWorkerUserData>): agents.inference.VAD {
  if (!proc.userData.vad) {
    proc.userData.vad = new agents.inference.VAD(VAD_OPTIONS)
  }
  return proc.userData.vad
}

async function resolveRoomMetadata(ctx: agents.JobContext): Promise<RoomMetadata | null> {
  const fromRtcRoom = parseVoiceRoomMetadata(ctx.room.metadata)
  if (fromRtcRoom) return fromRtcRoom

  const fromJobRoom = parseVoiceRoomMetadata(ctx.job.room?.metadata)
  if (fromJobRoom) return fromJobRoom

  const roomName = ctx.room.name || ctx.job.room?.name
  if (!roomName) return null

  return getConversationContextByRoomName(roomName)
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

async function entrypoint(ctx: agents.JobContext<VoiceWorkerUserData>) {
  const jobStartedAt = Date.now()
  const metadataFromJob = parseVoiceRoomMetadata(ctx.job.room?.metadata)

  const [, prefetchedAgent] = await Promise.all([
    ctx.connect(),
    metadataFromJob ? getAgentByIdCached(metadataFromJob.agentId) : Promise.resolve(null),
  ])
  const roomConnectedAt = Date.now()

  const metadata = metadataFromJob ?? (await resolveRoomMetadata(ctx))
  if (!metadata) {
    console.error(`[voice-agent] room ${ctx.room.name} has no valid metadata; disconnecting`)
    await ctx.room.disconnect()
    return
  }

  const { agentId, conversationId } = metadata
  const roomName = ctx.room.name || ctx.job.room?.name || conversationId

  let startedAt = Date.now()
  let finished = false
  let organizationId: string | undefined
  let businessName: string | null | undefined
  let maxDurationTimer: NodeJS.Timeout | undefined
  let transcriptCollector: CallTranscriptCollector | null = null

  const finalizeConversation = async (status: 'completed' | 'failed', endedReason?: string) => {
    if (finished) return
    finished = true
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer)
      maxDurationTimer = undefined
    }
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000)
    const transcript = transcriptCollector?.getMessages() ?? []

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
    const agentDetail = prefetchedAgent ?? (await getAgentByIdCached(agentId))
    const agentFetchedAt = Date.now()

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
    const greetingCacheKey = buildGreetingCacheKey(voiceId, toneTag, greetingText)
    const greetingPromise = synthesizeCachedFrames(tts, greetingText, greetingCacheKey)

    const session = new agents.AgentSession({
      stt: OpenAISTT.withGroq(),
      llm: OpenAILLM.withGroq({ model: groqModel }),
      tts,
      vad: createSessionVad(ctx.proc),
      turnHandling: {
        turnDetection: 'vad',
        endpointing: { minDelay: 300, maxDelay: 2500 },
        interruption: { mode: 'vad', minDuration: 400 },
      },
      aecWarmupDuration: 0,
    })

    await greetingPromise
    const agentReadyAt = Date.now()

    startedAt = Date.now()
    transcriptCollector = new CallTranscriptCollector(startedAt)
    void startCallRecording(roomName, conversationId)

    transcriptCollector.attach(session)
    attachVoiceSessionMetrics(session, {
      conversationId,
      roomName,
    })

    let sessionStartedAt = agentReadyAt
    let firstSpeakingLogged = false
    session.on(agents.AgentSessionEventTypes.AgentStateChanged, (event) => {
      if (event.newState !== 'speaking' || firstSpeakingLogged) return
      firstSpeakingLogged = true
      logVoiceStartupLatency({
        conversationId,
        roomName,
        jobStartedAt,
        roomConnectedAt,
        agentFetchedAt,
        agentReadyAt,
        sessionStartedAt,
        firstSpeakingAt: Date.now(),
        agentPrefetched: prefetchedAgent !== null,
      })
    })

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

    sessionStartedAt = Date.now()
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

export default agents.defineAgent<VoiceWorkerUserData>({
  entry: entrypoint,
  prewarm: (proc) => {
    try {
      initVad()
      proc.userData.vad = new agents.inference.VAD(VAD_OPTIONS)
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
    numIdleProcesses: 1,
  })
)
