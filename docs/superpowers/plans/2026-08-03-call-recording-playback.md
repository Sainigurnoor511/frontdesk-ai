# Call Recording & Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every web call (dashboard test calls + public booking-page calls) via LiveKit Room Composite Egress to Supabase Storage, and play the recording back in the conversation detail sheet with a real waveform, scrubber, and transport controls matching the supplied reference UI.

**Architecture:** At room creation (both `startDashboardCall` and `startPublicCall`), start a LiveKit `RoomCompositeEgress` (audio-only) writing to a Supabase Storage S3-compatible bucket, and store the room name on the `conversations` row. A new `/api/webhooks/livekit` route verifies LiveKit webhook signatures and, on `egress_ended`, writes the resulting object path to `conversations.recording_path`. The conversation sheet's data loader generates a short-lived signed URL for playback; the client renders a real `<audio>`-backed player with a canvas waveform computed from decoded audio via the Web Audio API.

**Tech Stack:** `livekit-server-sdk` (`EgressClient`, `WebhookReceiver`), Supabase Storage (S3-compatible endpoint), Next.js Route Handler, Web Audio API (`AudioContext.decodeAudioData`), `<canvas>`.

## Global Constraints

- Every `organization_id`-scoped query must resolve the caller's org via `supabase.auth.getUser()` → `members` table lookup, never a client-supplied id (per `AGENTS.md`).
- Validation lives in `lib/validations/*.ts` as Zod schemas, not inline in actions/components.
- `server-only` must not be imported by any module also consumed outside a Next.js request context (workers, webhook route) — follow the `lib/supabase/service-role.ts` vs `lib/supabase/server.ts` split.
- Migrations are numbered SQL files in `supabase/migrations/`, RLS policies follow the `organization_id in (select organization_id from members where user_id = auth.uid())` pattern.
- Max call duration is capped at 300 seconds (`MAX_CALL_SECONDS` in both `app/(dashboard)/actions/voice.ts` and `app/book/actions.ts`) — recordings are bounded by this.
- Recording failures must never block or fail a call — egress start/webhook errors are logged and degrade to the existing inert placeholder.

---

### Task 1: Migrations — `recording_path`, `room_name`, storage bucket

**Files:**
- Create: `supabase/migrations/00000000000026_conversation_recording.sql`

**Interfaces:**
- Produces: `conversations.recording_path text` (nullable), `conversations.room_name text` (nullable), storage bucket `call-recordings` (private).

- [ ] **Step 1: Write the migration**

```sql
alter table conversations add column room_name text;
alter table conversations add column recording_path text;

insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

-- No end-user (anon/authenticated via PostgREST) access to this bucket at all —
-- every read goes through a server-generated signed URL using the service-role
-- client, and every write comes from the LiveKit webhook route (also service-role).
-- Intentionally no policies created: storage.objects has RLS enabled by default
-- and default-deny, so omitting policies here already blocks direct client access.
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (requires `SUPABASE_ACCESS_TOKEN` env var set from `.env.local`'s `SUPABASE_TOKEN`, same pattern used in this repo previously — see prior session's `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_TOKEN=' .env.local | cut -d= -f2-) && npx supabase db push`)

Expected: `"upToDate":false` output listing `00000000000026_conversation_recording.sql` applied, no errors.

- [ ] **Step 3: Verify**

Run: `npx supabase migration list 2>&1 | tail -5` (with the same `SUPABASE_ACCESS_TOKEN` export)

Expected: `00000000000026` present in both `local` and `remote` columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00000000000026_conversation_recording.sql
git commit -m "feat: add conversation recording_path/room_name columns and call-recordings storage bucket"
```

---

### Task 2: Env vars + Supabase Storage S3 client config

**Files:**
- Modify: `.env.local` (add new vars — not committed, but document in `.env.example` if one exists)
- Create: `lib/voice/recording-config.ts`

**Interfaces:**
- Produces: `getRecordingS3Config(): { accessKey: string; secret: string; bucket: string; region: string; endpoint: string } | null` — returns `null` (not throws) when env vars are unset, so callers can skip egress gracefully in local dev without recording configured.

- [ ] **Step 1: Check for an `.env.example` file**

Run: `ls .env.example 2>&1`

If it exists, add these four lines (values blank/placeholder):
```
SUPABASE_STORAGE_S3_ENDPOINT=
SUPABASE_STORAGE_S3_REGION=
SUPABASE_STORAGE_S3_ACCESS_KEY=
SUPABASE_STORAGE_S3_SECRET_KEY=
```

- [ ] **Step 2: Write `lib/voice/recording-config.ts`**

```typescript
export type RecordingS3Config = {
  accessKey: string
  secret: string
  bucket: string
  region: string
  endpoint: string
}

const BUCKET = 'call-recordings'

/**
 * Returns null (rather than throwing) when the Supabase Storage S3 connection
 * isn't configured — recording is optional infrastructure, and callers must
 * be able to skip starting egress in local/dev environments without it.
 */
export function getRecordingS3Config(): RecordingS3Config | null {
  const endpoint = process.env.SUPABASE_STORAGE_S3_ENDPOINT
  const region = process.env.SUPABASE_STORAGE_S3_REGION
  const accessKey = process.env.SUPABASE_STORAGE_S3_ACCESS_KEY
  const secret = process.env.SUPABASE_STORAGE_S3_SECRET_KEY

  if (!endpoint || !region || !accessKey || !secret) return null

  return { accessKey, secret, region, endpoint, bucket: BUCKET }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/voice/recording-config.ts .env.example
git commit -m "feat: add Supabase Storage S3 config helper for call recordings"
```

(If no `.env.example` exists, just commit `lib/voice/recording-config.ts`.)

---

### Task 3: Start egress in `createConversation` call sites, store `room_name`

**Files:**
- Modify: `lib/data/conversations-service.ts:44-56` (`CreateConversationInput` type, `createConversation`)
- Modify: `app/(dashboard)/actions/voice.ts:37-59`
- Modify: `app/book/actions.ts:70-92`
- Create: `lib/voice/recording.ts`

**Interfaces:**
- Consumes: `getRecordingS3Config()` from Task 2 (`lib/voice/recording-config.ts`).
- Produces: `startCallRecording(roomName: string, conversationId: string): Promise<void>` — fire-and-forget helper, never throws (catches and logs internally). `createConversation` now accepts an optional `roomName` in `CreateConversationInput` and persists it.

- [ ] **Step 1: Add `roomName` to `CreateConversationInput` and persist it**

In `lib/data/conversations-service.ts`, modify the type and insert:

```typescript
export type CreateConversationInput = {
  organizationId: string
  agentId: string | null
  channel: 'voice_web' | 'phone' | 'chat'
  status: 'active'
  roomName?: string
}

export async function createConversation(
  input: CreateConversationInput
): Promise<Conversation> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      organization_id: input.organizationId,
      agent_id: input.agentId,
      channel: input.channel,
      status: input.status,
      room_name: input.roomName ?? null,
    })
    .select(CONVERSATION_COLUMNS)
    .single()

  if (error || !data) {
    throw new Error(`Failed to create conversation: ${error?.message ?? 'unknown error'}`)
  }

  return mapConversation(data as ConversationRow)
}
```

Also add `room_name` to `CONVERSATION_COLUMNS`, the `ConversationRow` type, and `mapConversation`'s output (add `roomName: row.room_name` to the returned `Conversation` — check `Conversation`/`ConversationRow` types earlier in this file and extend them the same way `agentName`/`agents` was added previously in `lib/data/conversations.ts`).

- [ ] **Step 2: Write `lib/voice/recording.ts`**

```typescript
import { EgressClient } from 'livekit-server-sdk'
import { getRecordingS3Config } from './recording-config'

/**
 * Starts a room-composite (audio-only, single mixed track) egress for a call,
 * writing to the org-agnostic `call-recordings` bucket keyed by conversation id.
 * Never throws — recording is best-effort and must not block or fail a call.
 */
export async function startCallRecording(roomName: string, conversationId: string): Promise<void> {
  const s3 = getRecordingS3Config()
  if (!s3) return

  try {
    const egressClient = new EgressClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    )
    await egressClient.startRoomCompositeEgress(
      roomName,
      {
        file: {
          filepath: `${conversationId}.ogg`,
          output: {
            case: 's3',
            value: {
              accessKey: s3.accessKey,
              secret: s3.secret,
              region: s3.region,
              endpoint: s3.endpoint,
              bucket: s3.bucket,
              forcePathStyle: true,
            },
          },
        },
      },
      { audioOnly: true }
    )
  } catch (err) {
    console.error(`[recording] failed to start egress for room ${roomName}:`, err)
  }
}
```

- [ ] **Step 3: Wire into `app/(dashboard)/actions/voice.ts`**

After the existing `createConversation` call (around line 38-43), pass `roomName` (the room name is already computed before `createConversation` is called — move the `createConversation` call to after `roomName` is defined if not already, or pass it inline since `roomName` is defined at line 37 before `createConversation` at line 38):

```typescript
const roomName = `${member.organization_id}:call:${crypto.randomUUID()}`
const conversation = await createConversation({
  organizationId: member.organization_id,
  agentId: parsed.data.agentId,
  channel: 'voice_web',
  status: 'active',
  roomName,
})
```

Then, inside the existing `try` block, immediately after `await roomService.createRoom({...})` (around line 59):

```typescript
await roomService.createRoom({
  name: roomName,
  metadata: JSON.stringify({ agentId: parsed.data.agentId, conversationId: conversation.id }),
  emptyTimeout: MAX_CALL_SECONDS,
  departureTimeout: 30,
})

void startCallRecording(roomName, conversation.id)
```

Add the import: `import { startCallRecording } from '@/lib/voice/recording'`

- [ ] **Step 4: Wire into `app/book/actions.ts`**

Same pattern — `createConversation` at line 71-76 already has `roomName` defined above it (line 70); add `roomName` to the input, and add `void startCallRecording(roomName, conversation.id)` right after `await roomService.createRoom({...})` (around line 92). Add the same import.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors. If `EncodedFileOutput`'s `file` key expects a class instance rather than a plain object, TypeScript will flag it — in that case wrap with `new EncodedFileOutput({...})` imported from `@livekit/protocol` (check the error message and adjust; the SDK's `EncodedOutputs.file` type is `EncodedFileOutput | undefined` per `EgressClient.d.ts`, which may require the class constructor rather than a plain object literal).

- [ ] **Step 6: Commit**

```bash
git add lib/voice/recording.ts lib/data/conversations-service.ts "app/(dashboard)/actions/voice.ts" app/book/actions.ts
git commit -m "feat: start LiveKit room-composite egress recording on call start"
```

---

### Task 4: LiveKit webhook receiver

**Files:**
- Create: `app/api/webhooks/livekit/route.ts`

**Interfaces:**
- Consumes: `WebhookReceiver` from `livekit-server-sdk`; `createServiceRoleClient` from `@/lib/supabase/service-role`.
- Produces: `POST /api/webhooks/livekit` route handler.

- [ ] **Step 1: Write the route**

```typescript
import { WebhookReceiver } from 'livekit-server-sdk'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!)

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

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('conversations')
    .update({ recording_path: filename })
    .eq('room_name', roomName)

  if (error) {
    console.error(`[livekit-webhook] failed to write recording_path for room ${roomName}:`, error)
  }

  return new Response('ok', { status: 200 })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors. If `event.egressInfo` isn't the correct property name on `WebhookEvent`, check `node_modules/@livekit/protocol/dist/index.d.ts` for the `WebhookEvent` message's field name (search `class WebhookEvent` — it should have an `egress_info` field mapped to `egressInfo` in the generated TS).

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/livekit/route.ts
git commit -m "feat: add LiveKit webhook receiver to capture recording paths"
```

---

### Task 5: Configure LiveKit Cloud to send webhooks (manual/docs step)

**Files:**
- Modify: `docs/superpowers/TODO.md` (add a manual setup note, if this file tracks such things — check its existing structure first)

- [ ] **Step 1: Check `docs/superpowers/TODO.md` structure**

Run: `head -30 docs/superpowers/TODO.md`

- [ ] **Step 2: Add a note under the appropriate section**

Add a line noting: LiveKit Cloud project settings → Webhooks must be configured to POST to `https://<deployed-domain>/api/webhooks/livekit` with the same API key/secret already in use, for recordings to actually get captured in production. This is a dashboard-configured setting outside the codebase, cannot be automated here.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/TODO.md
git commit -m "docs: note LiveKit webhook configuration needed for call recording"
```

(Skip this task entirely if `docs/` turns out to be gitignored, matching this repo's existing convention — in that case just tell the user directly instead of writing a file.)

---

### Task 6: Signed URL generation for playback

**Files:**
- Modify: `lib/data/conversations.ts` (add `recordingPath` to `Conversation` type, add `getConversationRecordingUrl`)

**Interfaces:**
- Consumes: `Conversation.id`, `Conversation.recordingPath` (new field).
- Produces: `getConversationRecordingUrl(conversationId: string): Promise<string | null>` — returns a signed URL (1 hour TTL) or `null` if no recording exists or the caller isn't authorized for that org.

- [ ] **Step 1: Add `recordingPath` to `Conversation` type and mapping**

In `lib/data/conversations.ts`, add `recording_path` to `CONVERSATION_COLUMNS`, `ConversationRow`, and `Conversation` (as `recordingPath: string | null`), and map it in `mapConversation` (`recordingPath: row.recording_path`). Do the same in `lib/data/conversations-service.ts`'s parallel `ConversationRow`/`mapConversation` (set `recordingPath: row.recording_path ?? null`, matching the `agentName: null` pattern already used there for fields not relevant to the worker's write path).

- [ ] **Step 2: Add `getConversationRecordingUrl`**

```typescript
export async function getConversationRecordingUrl(conversationId: string): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return null

  const { data: conversation } = await supabase
    .from('conversations')
    .select('recording_path')
    .eq('id', conversationId)
    .eq('organization_id', member.organization_id)
    .single()

  if (!conversation?.recording_path) return null

  const { data: signed, error } = await supabase.storage
    .from('call-recordings')
    .createSignedUrl(conversation.recording_path, 3600)

  if (error || !signed) return null

  return signed.signedUrl
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/data/conversations.ts lib/data/conversations-service.ts
git commit -m "feat: add signed URL lookup for conversation recordings"
```

---

### Task 7: Wire signed URL into the conversations page + sheet open handler

**Files:**
- Modify: `app/(dashboard)/conversations/conversations-client.tsx`
- Create: `app/(dashboard)/conversations/actions.ts` (check if this file already exists — it's referenced in the existing client component's imports for `markMessageAsRead` etc.; if so, add to it rather than creating a new file)

**Interfaces:**
- Consumes: `getConversationRecordingUrl` from Task 6.
- Produces: server action `getRecordingUrl(conversationId: string): Promise<string | null>`, callable from the client component when a sheet opens.

- [ ] **Step 1: Check existing `actions.ts`**

Run: `cat "app/(dashboard)/conversations/actions.ts"` (this file must already exist since `conversations-client.tsx` imports `markMessageAsRead`, `markAllMessagesAsRead`, `deleteMessage`, `createContactFromMessage` from `'./actions'`).

- [ ] **Step 2: Add `getRecordingUrl` action**

Add to `app/(dashboard)/conversations/actions.ts`:

```typescript
import { getConversationRecordingUrl } from '@/lib/data/conversations'

export async function getRecordingUrl(conversationId: string): Promise<string | null> {
  return getConversationRecordingUrl(conversationId)
}
```

- [ ] **Step 3: Fetch the signed URL when a conversation is selected**

In `conversations-client.tsx`, the row's external-link icon click handler currently does `setSelected(conversation); setDetailTab('overview')` (two call sites: the row button and, per the earlier accordion work, the separate icon span). Add recording-URL state and fetch:

```typescript
const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
const [recordingLoading, setRecordingLoading] = useState(false)

function openConversation(conversation: Conversation) {
  setSelected(conversation)
  setDetailTab('overview')
  setRecordingUrl(null)
  if (conversation.recordingPath) {
    setRecordingLoading(true)
    startTransition(async () => {
      const url = await getRecordingUrl(conversation.id)
      setRecordingUrl(url)
      setRecordingLoading(false)
    })
  }
}
```

Replace both call sites that currently do `setSelected(conversation); setDetailTab('overview')` with `openConversation(conversation)`. Add `getRecordingUrl` to the existing action imports at the top of the file.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/conversations/actions.ts" "app/(dashboard)/conversations/conversations-client.tsx"
git commit -m "feat: fetch signed recording URL when opening a conversation"
```

---

### Task 8: Real audio player component with waveform

**Files:**
- Create: `components/conversations/call-audio-player.tsx`

**Interfaces:**
- Consumes: `recordingUrl: string | null`, `durationSeconds: number` (fallback display before metadata loads).
- Produces: `<CallAudioPlayer recordingUrl={string | null} durationSeconds={number} />` — self-contained player matching the reference UI: waveform canvas (real peaks when `recordingUrl` is set, static bars when `null`), play/pause, `1.0x` speed cycle, rewind 5s / forward 10s, time display, more-options button (no-op menu, kept for parity with the reference — only a placeholder trigger, no items defined).

- [ ] **Step 1: Write the component**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Undo2, Redo2, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEEDS = [1, 1.5, 2, 0.5] as const

export function CallAudioPlayer({
  recordingUrl,
  durationSeconds,
}: {
  recordingUrl: string | null
  durationSeconds: number
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(durationSeconds)
  const [speedIndex, setSpeedIndex] = useState(0)

  // Decode audio client-side to compute waveform peaks — no server-side
  // precomputation for v1, acceptable given the 5-minute call duration cap.
  useEffect(() => {
    if (!recordingUrl) {
      setPeaks(null)
      return
    }
    let cancelled = false
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const audioContext = new AudioContextCtor()

    fetch(recordingUrl)
      .then((res) => res.arrayBuffer())
      .then((buf) => audioContext.decodeAudioData(buf))
      .then((decoded) => {
        if (cancelled) return
        const channelData = decoded.getChannelData(0)
        const barCount = 80
        const blockSize = Math.floor(channelData.length / barCount)
        const computed: number[] = []
        for (let i = 0; i < barCount; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[i * blockSize + j] ?? 0)
          }
          computed.push(sum / blockSize)
        }
        const max = Math.max(...computed, 0.0001)
        setPeaks(computed.map((v) => v / max))
      })
      .catch((err) => {
        console.error('[call-audio-player] failed to decode audio for waveform:', err)
      })
      .finally(() => {
        void audioContext.close()
      })

    return () => {
      cancelled = true
    }
  }, [recordingUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bars = peaks ?? Array.from({ length: 60 }, (_, i) => 0.2 + ((i * 7) % 28) / 40)
    const width = canvas.width
    const height = canvas.height
    const barWidth = width / bars.length

    ctx.clearRect(0, 0, width, height)
    const progress = duration > 0 ? currentTime / duration : 0
    bars.forEach((value, i) => {
      const barHeight = Math.max(2, value * height)
      const played = i / bars.length < progress
      ctx.fillStyle = played ? 'currentColor' : 'rgba(128,128,128,0.3)'
      ctx.fillRect(i * barWidth + 1, (height - barHeight) / 2, Math.max(1, barWidth - 2), barHeight)
    })
  }, [peaks, currentTime, duration])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      void audio.play()
    }
  }

  function seekBy(deltaSeconds: number) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + deltaSeconds))
  }

  function cycleSpeed() {
    const nextIndex = (speedIndex + 1) % SPEEDS.length
    setSpeedIndex(nextIndex)
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[nextIndex]
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const audio = audioRef.current
    if (!audio || duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audio.currentTime = ratio * duration
  }

  const disabled = !recordingUrl

  return (
    <div className="space-y-3">
      {recordingUrl && (
        <audio
          ref={audioRef}
          src={recordingUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
        />
      )}
      <canvas
        ref={canvasRef}
        width={600}
        height={44}
        onClick={disabled ? undefined : handleCanvasClick}
        className={`h-11 w-full text-foreground ${disabled ? '' : 'cursor-pointer'}`}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="icon"
            className="size-9 rounded-full"
            disabled={disabled}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </Button>
          <button
            type="button"
            disabled={disabled}
            onClick={cycleSpeed}
            className="text-sm text-muted-foreground disabled:opacity-50"
          >
            {SPEEDS[speedIndex]}x
          </button>
          <Undo2
            role="button"
            aria-label="Rewind 5 seconds"
            className={`size-4 ${disabled ? 'text-muted-foreground/40' : 'cursor-pointer text-muted-foreground'}`}
            onClick={disabled ? undefined : () => seekBy(-5)}
          />
          <Redo2
            role="button"
            aria-label="Fast forward 10 seconds"
            className={`size-4 ${disabled ? 'text-muted-foreground/40' : 'cursor-pointer text-muted-foreground'}`}
            onClick={disabled ? undefined : () => seekBy(10)}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <Button type="button" variant="outline" size="icon" className="size-8" disabled>
            <MoreHorizontal />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/conversations/call-audio-player.tsx
git commit -m "feat: add real audio player with client-decoded waveform"
```

---

### Task 9: Swap the sheet's static placeholder for `CallAudioPlayer`

**Files:**
- Modify: `app/(dashboard)/conversations/conversations-client.tsx`

**Interfaces:**
- Consumes: `CallAudioPlayer` from Task 8, `recordingUrl`/`recordingLoading` state from Task 7.

- [ ] **Step 1: Replace the existing static waveform + control block**

Find the block added in the earlier session (waveform bars div + play/speed/undo/redo/time/more-menu row, all `disabled`) inside the `Sheet` content. Replace it entirely with:

```tsx
<CallAudioPlayer
  recordingUrl={recordingUrl}
  durationSeconds={selected.durationSeconds}
/>
```

Add the import: `import { CallAudioPlayer } from '@/components/conversations/call-audio-player'`

Remove now-unused imports if the old inline block was the only consumer of `Play`, `Undo2`, `Redo2`, `MoreHorizontal` icons in this file (check remaining usages with grep before removing).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors, no unused-import warnings.

- [ ] **Step 3: Lint**

Run: `npx eslint "app/(dashboard)/conversations/**/*.tsx" "components/conversations/**/*.tsx"`
Expected: no new errors (pre-existing unrelated errors in `voices-tab.tsx` are out of scope, ignore if they reappear).

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, sign in, start a dashboard test call (or open an existing conversation without a recording — confirm it falls back to the inert placeholder look, not a crash), open the conversations page, open a conversation's sheet, confirm:
- No `recordingPath`: waveform shows static bars, all controls disabled, no console errors.
- With a `recordingPath` (after a real call completes and the webhook lands): waveform renders real peaks, play/pause works, scrubbing by clicking the canvas seeks, rewind/forward buttons work, speed cycles through 1/1.5/2/0.5.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/conversations/conversations-client.tsx"
git commit -m "feat: wire real CallAudioPlayer into the conversation detail sheet"
```

---

## Self-Review Notes

- **Spec coverage:** Egress start (Task 3), webhook (Task 4), storage/migration (Task 1), signed URL (Task 6-7), playback UI (Task 8-9), env vars (Task 2), LiveKit Cloud webhook config (Task 5, manual/docs) — all spec sections have a task.
- **Fallback behavior:** Task 8's player explicitly handles `recordingUrl === null` (static bars, disabled controls) per spec's "Error handling" section — no broken state for calls predating this feature or failed egress.
- **Type consistency:** `Conversation.recordingPath` (Task 6) is the single name used consistently in Tasks 7 and 9; `room_name` (snake_case DB column) vs `roomName` (camelCase TS field) follows the same mapping convention already used for every other column in `lib/data/conversations.ts`.
- **Out of scope confirmed:** no phone/SIP recording, no server-side peak precomputation, no retention policy — matches the spec's explicit exclusions.
