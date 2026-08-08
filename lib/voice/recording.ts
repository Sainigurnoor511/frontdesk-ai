import { EncodedFileOutput, EncodedFileType, S3Upload, type EgressInfo } from '@livekit/protocol'
import { EgressClient, EgressStatus } from 'livekit-server-sdk'
import { normalizeRecordingPath } from '@/lib/conversations/recording-path'
import { getRecordingS3Config } from './recording-config'

/**
 * Starts a room-composite (audio-only) egress for a call, writing to the
 * `call-recordings` bucket keyed by conversation id. Never throws — recording
 * is best-effort and must not block or fail a call.
 */
export async function startCallRecording(roomName: string, conversationId: string): Promise<void> {
  const s3 = getRecordingS3Config()
  if (!s3) return

  const livekitUrl = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!livekitUrl || !apiKey || !apiSecret) return

  try {
    const egressClient = new EgressClient(livekitUrl, apiKey, apiSecret)
    const output = new EncodedFileOutput({
      // MP3, not OGG: OGG (Opus) is undecodable via `decodeAudioData` in
      // Chromium and unplayable in Safari. MP3 works everywhere.
      fileType: EncodedFileType.MP3,
      filepath: `${conversationId}.mp3`,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: s3.accessKey,
          secret: s3.secret,
          region: s3.region,
          endpoint: s3.endpoint,
          bucket: s3.bucket,
          forcePathStyle: true,
        }),
      },
    })

    await egressClient.startRoomCompositeEgress(roomName, output, { audioOnly: true })
  } catch (err) {
    console.error(`[recording] failed to start egress for room ${roomName}:`, err)
  }
}

/**
 * Extracts the recorded filename from an egress. The `file` field is only
 * surfaced through `toJSON()` (it is absent from the typed proto fields and
 * `fileResults` comes back empty), so read it via a runtime cast.
 */
type EgressJson = {
  file?: { filename?: string } | null
  fileResults?: Array<{ filename?: string }> | null
}

export function readEgressFilename(egress: EgressInfo): string | null {
  const json = (egress as unknown as { toJSON: () => EgressJson }).toJSON()
  return json.file?.filename ?? json.fileResults?.[0]?.filename ?? null
}

/**
 * Looks up the most recently completed egress recording for a room and returns
 * its normalized object key inside `call-recordings`, or null when none exists.
 * Used as a fallback when the `egress_ended` webhook was never delivered (e.g.
 * local dev), so recordings are still discoverable via the LiveKit API.
 */
export async function getEgressRecordingForRoom(roomName: string): Promise<string | null> {
  const livekitUrl = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!roomName || !livekitUrl || !apiKey || !apiSecret) return null

  try {
    const egressClient = new EgressClient(livekitUrl, apiKey, apiSecret)
    // List without the roomName filter: LiveKit omits file details when
    // filtering server-side, and `file` is only populated via toJSON().
    const egresses = await egressClient.listEgress()

    const completed = egresses
      .filter((egress) => egress.roomName === roomName)
      .filter((egress) => egress.status === EgressStatus.EGRESS_COMPLETE)
      .filter((egress) => !egress.error)
      .sort((a, b) => Number(b.endedAt ?? 0) - Number(a.endedAt ?? 0))

    for (const egress of completed) {
      const filename = readEgressFilename(egress)
      if (!filename) continue
      const recordingPath = normalizeRecordingPath(filename)
      if (recordingPath) return recordingPath
    }

    return null
  } catch (err) {
    console.error(`[recording] failed to look up egress for room ${roomName}:`, err)
    return null
  }
}
