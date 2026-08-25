import { getConversationRecordingUrl } from '@/lib/data/conversations'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  const signedUrl = await getConversationRecordingUrl(id)

  if (!signedUrl) {
    return new Response('Recording not found', { status: 404 })
  }

  const range = request.headers.get('range')
  const upstream = await fetch(signedUrl, {
    headers: range ? { Range: range } : undefined,
  })

  if (!upstream.ok || !upstream.body) {
    console.error(
      `[recording] upstream fetch failed for conversation ${id}: ${upstream.status}`
    )
    return new Response('Recording not found', { status: 404 })
  }

  const headers = new Headers({
    'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/mpeg',
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  })

  const contentRange = upstream.headers.get('Content-Range')
  const contentLength = upstream.headers.get('Content-Length')
  if (contentRange) headers.set('Content-Range', contentRange)
  if (contentLength) headers.set('Content-Length', contentLength)

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  })
}
