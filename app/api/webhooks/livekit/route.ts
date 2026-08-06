import { WebhookReceiver } from 'livekit-server-sdk'
import { normalizeRecordingPath } from '@/lib/conversations/recording-path'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
)

export async function POST(request: Request): Promise<Response> {
  const body = await request.text()
  const authHeader = request.headers.get('Authorization') ?? undefined

  let event
  try {
    event = await receiver.receive(body, authHeader)
  } catch (err) {
    console.error('[livekit-webhook] signature verification failed:', err)
    return new Response('invalid signature', { status: 401 })
  }

  if (event.event !== 'egress_ended') {
    return new Response('ok', { status: 200 })
  }

  const egressInfo = event.egressInfo
  const roomName = egressInfo?.roomName
  const filename = egressInfo?.fileResults?.[0]?.filename

  if (!roomName || !filename) {
    console.error('[livekit-webhook] egress_ended missing roomName or filename', {
      roomName,
      hasFileResults: Boolean(egressInfo?.fileResults?.length),
    })
    return new Response('ok', { status: 200 })
  }

  const recordingPath = normalizeRecordingPath(filename)

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('conversations')
    .update({ recording_path: recordingPath })
    .eq('room_name', roomName)

  if (error) {
    console.error(`[livekit-webhook] failed to write recording_path for room ${roomName}:`, error)
  }

  return new Response('ok', { status: 200 })
}
