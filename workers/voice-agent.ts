import { config } from 'dotenv'
config({ path: '.env.local' })

import * as agents from '@livekit/agents'
import { LLM as OpenAILLM, STT as OpenAISTT } from '@livekit/agents-plugin-openai'
import { FishAudioTTS } from '@/lib/voice/adapters/fish-audio-tts'
import { buildSystemPrompt, buildToneTag } from '@/lib/voice/agent-context'
import { buildBookingTools } from '@/lib/voice/booking-tools'
import { defaultVoiceIdForLanguage } from '@/lib/data/voice-catalog'
import { getAgentByIdServiceRole } from '@/lib/data/agents-service'
import { updateConversationStatus } from '@/lib/data/conversations-service'

/**
 * JSON payload set on the LiveKit room's metadata at creation time by
 * `startDashboardCall`/`startPublicCall` (see `app/(dashboard)/actions/voice.ts`
 * and `app/book/actions.ts`), via `RoomServiceClient.createRoom({ metadata })`.
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

async function entrypoint(ctx: agents.JobContext) {
  await ctx.connect()

  const metadata = parseRoomMetadata(ctx.room.metadata)
  if (!metadata) {
    console.error(`[voice-agent] room ${ctx.room.name} has no valid metadata; disconnecting`)
    await ctx.room.disconnect()
    return
  }

  const { agentId, conversationId } = metadata

  const startedAt = Date.now()
  let finished = false
  let maxDurationTimer: NodeJS.Timeout | undefined
  const finalizeConversation = async (status: 'completed' | 'failed', endedReason?: string) => {
    if (finished) return
    finished = true
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer)
      maxDurationTimer = undefined
    }
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000)
    try {
      await updateConversationStatus(conversationId, {
        status,
        outcome: status === 'completed' ? 'successful' : 'failed',
        durationSeconds,
        ...(endedReason ? { endedReason } : {}),
      })
    } catch (err) {
      console.error(`[voice-agent] failed to update conversation ${conversationId} status:`, err)
    }
  }

  try {
    const agentDetail = await getAgentByIdServiceRole(agentId)
    if (!agentDetail) {
      console.error(`[voice-agent] agent ${agentId} not found; failing conversation ${conversationId}`)
      await finalizeConversation('failed', 'agent_not_found')
      await ctx.room.disconnect()
      return
    }

    // Newly created accounts have no `voice_id` yet. Falling back to a
    // deterministic catalog voice (matched to the agent's language) keeps the
    // caller hearing one consistent voice per call — without a `reference_id`,
    // Fish Audio picks an unspecified/random voice per TTS request, which is
    // why fresh default agents used to change voice on every response.
    const voiceId = agentDetail.voice_id ?? defaultVoiceIdForLanguage(agentDetail.language)
    const toneTag = buildToneTag(agentDetail.tone_traits)

    const session = new agents.AgentSession({
      stt: OpenAISTT.withGroq(),
      llm: OpenAILLM.withGroq({ model: 'llama-3.3-70b-versatile' }),
      tts: new FishAudioTTS(voiceId, { tag: toneTag }),
    })

    ctx.room.on('disconnected', () => {
      void finalizeConversation('completed')
    })

    session.on(agents.AgentSessionEventTypes.Error, (ev) => {
      console.error(`[voice-agent] session error for conversation ${conversationId}:`, ev)
      void finalizeConversation('failed', 'session_error')
    })

    // The session closes (e.g. CloseReason.PARTICIPANT_DISCONNECTED when the
    // caller hangs up) independently of the worker's own connection to the
    // room — `AgentSession`'s built-in `closeOnDisconnect` behavior tears
    // down the session but does not disconnect `ctx.room` itself, so
    // `ctx.room.on('disconnected')` above never fires on its own and the
    // conversation would otherwise stay stuck in `active` until LiveKit's
    // `emptyTimeout` eventually reaps the room. Finalize and leave here
    // instead of waiting on a room-level event that may never come.
    session.on(agents.AgentSessionEventTypes.Close, (ev) => {
      if (ev.error) {
        console.error(`[voice-agent] session closed with error for conversation ${conversationId}:`, ev.error)
        void finalizeConversation('failed', 'session_closed_with_error')
      } else {
        void finalizeConversation('completed')
      }
      void ctx.room.disconnect()
    })

    ctx.addShutdownCallback(async () => {
      await finalizeConversation('completed')
    })

    await session.start({
      room: ctx.room,
      agent: new agents.Agent({
        instructions: buildSystemPrompt(agentDetail),
        tools: buildBookingTools({
          organizationId: agentDetail.organization_id,
          agentId,
          conversationId,
        }),
      }),
    })

    // Hard cap enforced worker-side regardless of client behavior — an
    // AccessToken's ttl only bounds when a token can be used to *join*, not
    // how long an already-connected call may run.
    maxDurationTimer = setTimeout(() => {
      void finalizeConversation('completed', 'max_duration')
      void ctx.room.disconnect()
    }, MAX_CALL_SECONDS * 1000)
  } catch (error) {
    // Full error detail (which may include sensitive internals like API error
    // bodies) stays in worker logs only; the DB column gets a generic reason.
    console.error(`[voice-agent] entrypoint failed for conversation ${conversationId}:`, error)
    await finalizeConversation('failed', 'internal_error')
    await ctx.room.disconnect()
  }
}

export default agents.defineAgent({ entry: entrypoint })

agents.cli.runApp(
  new agents.WorkerOptions({
    agent: import.meta.filename,
  })
)
