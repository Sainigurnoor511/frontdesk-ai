import { createHmac, timingSafeEqual } from 'node:crypto'
import { getConversationByAssemblyAiSessionId } from '@/lib/data/conversations-service'
import { enqueueAssemblyAiFinalize } from '@/lib/voice/providers/assemblyai/enqueue-finalize'

/**
 * Receives AssemblyAI Voice Agent webhook deliveries.
 *
 * This endpoint is an *optimization*, not a dependency. The browser's hangup
 * handler already queues transcript retrieval, and that job polls
 * `GET /v1/sessions/{id}` until the session completes. The webhook just makes it
 * happen sooner when a public URL is reachable — which is why local development
 * needs no tunnel.
 *
 * Register a subscription with `POST /v1/webhook-subscriptions` pointing at
 * `<site>/api/webhooks/assemblyai` for the `session.completed` event, using the
 * same secret as `ASSEMBLYAI_WEBHOOK_SECRET`.
 */
type WebhookPayload = {
  event?: string
  event_id?: string
  session?: {
    id?: string
    session_id?: string
    status?: string
  } | null
  session_id?: string
}

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false

  // Format is `sha256=<hex>`; tolerate a bare hex digest too.
  const provided = header.startsWith('sha256=') ? header.slice('sha256='.length) : header
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  // `timingSafeEqual` throws on length mismatch, so guard first. Comparing the
  // lengths is not itself a secret-dependent leak.
  if (provided.length !== expected.length) return false

  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

function readSessionId(payload: WebhookPayload): string | null {
  return payload.session?.id ?? payload.session?.session_id ?? payload.session_id ?? null
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET
  if (!secret) {
    // Refuse rather than accept unauthenticated deliveries. Unconfigured means
    // the hangup-triggered polling path is the only route in, which still works.
    console.error('[assemblyai-webhook] ASSEMBLYAI_WEBHOOK_SECRET is not configured; rejecting')
    return new Response('webhook not configured', { status: 503 })
  }

  // Signature is computed over the exact bytes received, so read the raw text and
  // never re-serialize the parsed JSON.
  const rawBody = await request.text()

  if (!verifySignature(rawBody, request.headers.get('X-AAI-Signature'), secret)) {
    console.error('[assemblyai-webhook] signature verification failed')
    return new Response('invalid signature', { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody) as WebhookPayload
  } catch {
    return new Response('invalid json', { status: 400 })
  }

  const event = payload.event ?? request.headers.get('X-AAI-Event') ?? ''

  // Everything else (session.started, call.*) needs no action today. Answer 2xx so
  // AssemblyAI doesn't retry deliveries we intentionally ignore.
  if (event !== 'session.completed') {
    return new Response('ok', { status: 200 })
  }

  const sessionId = readSessionId(payload)
  if (!sessionId) {
    console.error('[assemblyai-webhook] session.completed delivery carried no session id')
    return new Response('ok', { status: 200 })
  }

  const conversation = await getConversationByAssemblyAiSessionId(sessionId)
  if (!conversation) {
    // A session started from another environment sharing this API key, or one
    // whose browser never reported its id. Nothing to attach it to.
    return new Response('ok', { status: 200 })
  }

  // Idempotent by construction: the queue keys jobs by conversation id, so a
  // retried delivery collapses onto the existing job instead of duplicating work.
  // That also covers redelivery, which is why no separate `X-AAI-Delivery-Id`
  // dedupe store is needed.
  await enqueueAssemblyAiFinalize({
    conversationId: conversation.conversationId,
    sessionId,
    immediate: true,
  })

  return new Response('ok', { status: 200 })
}
