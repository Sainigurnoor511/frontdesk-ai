import { EncodedFileOutput, EncodedFileType, S3Upload } from '@livekit/protocol'
import { EgressClient } from 'livekit-server-sdk'
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
      fileType: EncodedFileType.OGG,
      filepath: `${conversationId}.ogg`,
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
