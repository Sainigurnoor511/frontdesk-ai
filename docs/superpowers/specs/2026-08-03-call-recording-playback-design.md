# Call Recording & Playback — Design

Date: 2026-08-03

## Overview

The conversation detail sheet (`app/(dashboard)/conversations/conversations-client.tsx`) has always shown a static, non-functional waveform placeholder — no recording pipeline exists anywhere in the codebase (confirmed: `conversations` table has no audio/recording column, `workers/voice-agent.ts` never touches LiveKit Egress, no webhook receiver exists). This project adds real recording capture for both call channels (dashboard test calls and public booking-page calls) and wires the sheet up to real playback, matching the reference UI supplied by the user (real waveform peaks, working scrubber, rewind 5s / forward 10s, play/pause, speed, time counter, more-menu).

## Architecture

```
Room creation (startDashboardCall / app/book/actions.ts)
        │
        ├─ roomService.createRoom(...)          (existing)
        └─ egressClient.startRoomCompositeEgress(roomName, {
               audioOnly: true,
               fileOutputs: [{ filepath, s3: {...supabase storage s3-compat...} }]
           })
        │
        ▼
   LiveKit Cloud records mixed audio for the room's lifetime
        │
        ▼ (on room/egress end)
   LiveKit webhook → POST /api/webhooks/livekit
        │  verify signature (WebhookReceiver)
        │  on `egress_ended`: read roomName from egress info,
        │  look up conversations row created at room-creation time,
        │  write conversations.recording_path (service-role client)
        ▼
   conversations.recording_path populated once egress finishes uploading

Conversation sheet load (server component / action)
        │
        ├─ if recording_path set: supabase.storage
        │     .from('call-recordings').createSignedUrl(path, ttl)
        └─ pass signed URL to client → real <audio> element,
           Web Audio API decodeAudioData computes waveform peaks client-side
```

## Egress start (both call-origin points)

- `app/(dashboard)/actions/voice.ts`'s `startDashboardCall`, right after the existing `roomService.createRoom(...)` call.
- The equivalent block in `app/book/actions.ts` (same `roomService.createRoom` pattern, confirmed present).
- Uses `EgressClient` from `livekit-server-sdk`, `startRoomCompositeEgress(roomName, output)` — audio-only (no video track exists anyway), single mixed track (matches the single-waveform UX in the reference image — no need to separately record caller/agent tracks).
- Output: `fileOutputs: [{ filepath: \`${conversationId}.ogg\`, s3: { endpoint, accessKey, secret, bucket, region } }]` pointed at Supabase Storage's S3-compatible endpoint.
- Egress start failures are logged but non-fatal to the call itself — a call should never fail to connect because recording failed to start.

## Storage

- New public-but-access-controlled bucket `call-recordings` in Supabase Storage (created via a migration using `storage.buckets` insert, `public = false`).
- RLS on `storage.objects` for this bucket: no direct client access — all reads go through server-generated signed URLs (short TTL, e.g. 1 hour), consistent with the org-scoped access pattern used everywhere else (dashboard user must belong to the `organization_id` that owns the conversation).
- 4 new env vars for the Supabase Storage S3-compatible connection: `SUPABASE_STORAGE_S3_ENDPOINT`, `SUPABASE_STORAGE_S3_REGION`, `SUPABASE_STORAGE_S3_ACCESS_KEY`, `SUPABASE_STORAGE_S3_SECRET_KEY` (from the Supabase project's Storage → S3 Connection settings).

## Webhook receiver

- New route `app/api/webhooks/livekit/route.ts`.
- Verifies the LiveKit webhook signature using `WebhookReceiver` (`livekit-server-sdk`), configured with the same `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` already in use.
- Handles the `egress_ended` event: reads `roomName` off the egress info, looks up the `conversations` row (room name embeds `organizationId:call:uuid`; conversation id is already known from room metadata at creation time and stored on the conversation itself, so lookup is by matching the room-name UUID against conversations created around that time, OR — simpler and more robust — store the LiveKit room name on the conversation row at creation time and look up by exact match).
- Writes `recording_path` via the service-role client (webhook has no user session).
- Ignores all other event types for now (`room_started`, `track_published`, etc. — not needed).

## Data model changes

- New migration: `conversations.recording_path text` (nullable — null until egress finishes, stays null if recording failed or was never started, e.g. calls that predate this feature).
- New migration: `conversations.room_name text` (nullable) — set at creation time (`createConversation` gains an optional `roomName` param), used by the webhook to find the right row without guessing from timestamps.
- Storage bucket creation migration (`storage.buckets` insert + RLS policy on `storage.objects`).

## Playback UI (sheet)

Matches the reference markup exactly in structure/spacing:
- Real waveform: canvas-based, drawn from peaks computed client-side via `AudioContext.decodeAudioData` on the signed URL's audio (no server-side peak precomputation for v1 — simplest path, acceptable since call audio is capped at 5 minutes).
- Draggable/click-to-seek scrubber synced to the underlying `<audio>` element's `currentTime`.
- Hover tooltip showing timestamp at cursor position (from reference: `0:21` bubble above waveform on hover).
- Controls: Play/Pause (filled black circle), `1.0x` speed toggle (cycles standard speeds), rewind 5s, forward 10s (icons + `title`/tooltip matching reference), `current / total` time display, "More options" button (kept as a no-op menu trigger for now — no additional actions defined yet, matches reference's presence without over-scoping its contents).
- If `recording_path` is null (call predates this feature, or recording failed), fall back to today's static/inert placeholder with the existing disabled controls — no broken player state.

## Error handling

- Egress start failure: logged, call proceeds without recording; `recording_path` stays null.
- Webhook signature verification failure: reject with 401, log.
- Webhook for a room that has no matching `conversations` row: log and ignore (should not happen given room_name is always set at creation, but must not crash the webhook handler).
- Signed URL generation failure when opening the sheet: fall back to the inert placeholder rather than erroring the whole sheet.

## Out of scope

- Per-participant (caller vs. agent) separated tracks — single mixed composite only.
- Server-side waveform peak precomputation/caching.
- Phone/SIP call recording — no telephony pipeline exists yet (tracked separately); this covers the two channels that exist today (dashboard test calls, public booking-page calls).
- Retention/deletion policy for old recordings — not addressed here.
