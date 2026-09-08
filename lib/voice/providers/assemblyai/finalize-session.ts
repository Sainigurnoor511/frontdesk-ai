import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getAgentByIdCached } from '@/lib/data/agents-service'
import {
  getConversationByAssemblyAiSessionId,
  setConversationRecordingPath,
  updateConversationStatus,
} from '@/lib/data/conversations-service'
import { generateCallSummary } from '@/lib/voice/generate-call-summary'
import { downloadArtifact, findArtifact, getAssemblyAiSession } from './client'
import { parseAssemblyAiTimeline, timelineToTranscript } from './timeline'

const RECORDING_BUCKET = 'call-recordings'

/**
 * AssemblyAI stores session recordings as OGG/Opus, stereo with the caller on the
 * left channel and the agent on the right.
 *
 * The LiveKit path deliberately records MP3 instead (see `lib/voice/recording.ts`)
 * because OGG can't be decoded by `decodeAudioData` in Chromium and doesn't play
 * in Safari. Keeping AssemblyAI's native format means:
 *
 *   - playback works in Chrome, Edge, and Firefox but not Safari, and
 *   - the waveform falls back to flat, which `CallAudioPlayer` already handles.
 *
 * The alternative is transcoding, which would mean adding ffmpeg to the worker
 * image. Not worth it to remove a flat waveform; revisit if Safari support
 * matters.
 */
const RECORDING_CONTENT_TYPE = 'audio/ogg'

/**
 * Uploads the recording into the same bucket and naming scheme the LiveKit path
 * uses, so `conversations.recording_path` and the existing signed-URL route work
 * unchanged.
 *
 * Uses the Storage API rather than the S3 credentials `getRecordingS3Config()`
 * needs, because those are only required for LiveKit's egress writer — the
 * service-role client can upload directly.
 */
async function storeRecording(conversationId: string, audio: ArrayBuffer): Promise<string | null> {
  const supabase = createServiceRoleClient()
  const objectKey = `${conversationId}.ogg`

  const { error } = await supabase.storage
    .from(RECORDING_BUCKET)
    .upload(objectKey, audio, { contentType: RECORDING_CONTENT_TYPE, upsert: true })

  if (error) {
    console.error(
      `[assemblyai] failed to upload recording for conversation ${conversationId}:`,
      error.message
    )
    return null
  }

  return objectKey
}

export class AssemblyAiSessionNotReadyError extends Error {
  constructor(sessionId: string, status: string) {
    super(`AssemblyAI session ${sessionId} is still ${status}`)
    this.name = 'AssemblyAiSessionNotReadyError'
  }
}

/**
 * Fetches a completed AssemblyAI session and writes its transcript, summary, and
 * recording onto the conversation.
 *
 * Idempotent: a conversation that is no longer `active` has already been
 * finalized, so this returns without writing. That's what lets the hangup path
 * and the webhook path both enqueue the work safely.
 *
 * Throws `AssemblyAiSessionNotReadyError` while the session is still settling so
 * BullMQ retries with backoff — artifacts only exist once the session completes.
 */
export async function finalizeAssemblyAiSession(options: {
  conversationId: string
  sessionId: string
}): Promise<void> {
  const { conversationId, sessionId } = options

  const conversation = await getConversationByAssemblyAiSessionId(sessionId)
  if (!conversation) {
    console.warn(`[assemblyai] no conversation linked to session ${sessionId}; nothing to finalize`)
    return
  }

  if (conversation.conversationId !== conversationId) {
    console.warn(
      `[assemblyai] session ${sessionId} is linked to conversation ${conversation.conversationId}, not ${conversationId}; skipping`
    )
    return
  }

  if (conversation.status !== 'active') {
    return
  }

  const session = await getAssemblyAiSession(sessionId)
  if (session.status !== 'completed') {
    throw new AssemblyAiSessionNotReadyError(sessionId, session.status)
  }

  const timelineArtifact = findArtifact(session, 'timeline')
  let transcript: ReturnType<typeof timelineToTranscript> = []
  if (timelineArtifact) {
    try {
      const raw = await downloadArtifact(timelineArtifact.url)
      transcript = timelineToTranscript(parseAssemblyAiTimeline(raw))
    } catch (err) {
      console.error(`[assemblyai] failed to read timeline for session ${sessionId}:`, err)
    }
  }

  let summary: string | undefined
  if (transcript.length > 0) {
    try {
      const businessName = conversation.agentId
        ? await getAgentByIdCached(conversation.agentId).then(
            (agent) => agent?.business_name ?? agent?.name ?? null
          )
        : null
      const generated = await generateCallSummary(transcript, { businessName })
      if (generated) summary = generated
    } catch (err) {
      console.error(`[assemblyai] summary generation failed for session ${sessionId}:`, err)
    }
  }

  // Prefer AssemblyAI's own measurement over wall-clock: it excludes the 30s
  // resume grace window, so it matches what the caller experienced.
  const durationSeconds = Math.round(
    session.session_duration_seconds ?? session.audio_duration_seconds ?? 0
  )

  // Terminal write. Passing `status` here is what fires the org's
  // `conversation.completed` webhook and the caller-message inbox check, both of
  // which need the transcript to be present — which is why the hangup path
  // deliberately leaves the conversation `active` for this job to close out.
  await updateConversationStatus(
    conversationId,
    {
      status: 'completed',
      outcome: transcript.length > 0 ? 'successful' : 'unknown',
      durationSeconds,
      transcript,
      ...(summary ? { summary } : {}),
    },
    conversation.organizationId
  )

  const recordingArtifact = findArtifact(session, 'recording')
  if (recordingArtifact) {
    try {
      const audio = await downloadArtifact(recordingArtifact.url)
      const objectKey = await storeRecording(conversationId, audio)
      if (objectKey) {
        await setConversationRecordingPath(conversationId, objectKey)
      }
    } catch (err) {
      // The transcript is the valuable artifact and is already saved; a missing
      // recording is a degraded conversation, not a failed one.
      console.error(`[assemblyai] failed to store recording for session ${sessionId}:`, err)
    }
  }
}
