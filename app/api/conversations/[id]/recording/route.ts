import { getConversationRecordingUrl } from '@/lib/data/conversations'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  const signedUrl = await getConversationRecordingUrl(id)

  if (!signedUrl) {
    return new Response('Recording not found', { status: 404 })
  }

  const upstream = await fetch(signedUrl)
  if (!upstream.ok || !upstream.body) {
    console.error(
      `[recording] upstream fetch failed for conversation ${id}: ${upstream.status}`
    )
    return new Response('Recording not found', { status: 404 })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/ogg',
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  })
}
