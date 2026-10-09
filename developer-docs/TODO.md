# Frontdesk.ai Shared TODO

Use this as the team-wide feature and technical backlog.

## How to use

- Keep items small and actionable.
- Mark complete items with `[x]` and keep unfinished items as `[ ]`.
- Add owner/date notes inline when helpful, for example: `(owner: @name, added: 2026-08-08)`.
- Move completed items to the bottom of each section during cleanup.

## Definition of Done (apply to every feature task)

Copy this block under a task when needed:

```md
- [ ] Scope implemented and matches requirement
- [ ] Validation/error states handled
- [ ] Relevant tests added/updated
- [ ] Lint/type checks pass for touched files
- [ ] Docs updated (README/ARCHITECTURE/TODO if needed)
```

Use this as the completion gate before marking a feature item done.

---

## P0 - Core Product Gaps

- [ ] **Apply migration `044_agent_voice_provider`** (added: 2026-09-06) — blocking, and
      currently a live regression rather than a missing feature. `AGENT_DETAIL_COLUMNS` in
      both `lib/data/agents.ts` and `lib/data/agents-service.ts` now selects
      `voice_provider`, so until the column exists PostgREST rejects the query,
      `getAgentById` returns null, and **every call fails with "Agent not found" —
      including LiveKit ones**. The agent detail page breaks too. Agent lists, the
      dashboard, and the public booking page are unaffected (`getAgentsForOrg` /
      `getPublicAgentsForOrg` were not touched). CI applies it on merge to main; locally
      run `supabase db push`.
- [ ] **Run the AssemblyAI session worker wherever the app is deployed** (added: 2026-09-06) —
      `pnpm start:jobs`, or the `worker-jobs` service in `docker-compose.yml`, which
      hosts the `assemblyai-session-finalize` queue along with the other three.
      Without it, AssemblyAI calls complete but their conversations stay `active` forever
      and never get a transcript, summary, or recording.
- [ ] **Verify an AssemblyAI call end to end from a real browser** (added: 2026-09-06,
      narrowed 2026-09-06 after a live protocol probe) — the wire protocol is now verified
      against the live API (see Completed Recently; three real bugs were found and fixed
      this way). Confirmed working: token mint, `session.update` acceptance, the greeting
      synthesizing and streaming back, `input.audio` pacing without
      `audio_rate_violation`, `session.end` → `session.ended` → close 1000, and session
      artifact retrieval.
      **Still unverified, because it needs a real microphone and a browser:** caller speech
      actually transcribing, barge-in mid-reply, a booking `tool.call` round-tripping
      through the server action, and the browser capture/playback path itself. Test in
      Firefox and Safari specifically — the in-worklet resampling exists because those two
      break the forced-24 kHz shortcut, and that code has never run.
- [ ] Enforce `answering_mode`/routing logic in `workers/voice-agent.ts`
- [ ] Add voice tools: cancel appointment, reschedule appointment
      (now provider-neutral: add to `lib/voice/tools/booking-handlers.ts` once and both
      the LiveKit and AssemblyAI paths pick it up)
- [ ] Wire feature flags to sidebar visibility and route guards
- [ ] Implement notification delivery from stored prefs (`organization_settings`)

## P1 - Knowledge + Conversations

- [ ] **Revisit multi-language support for AssemblyAI agents** (added: 2026-09-06) — root
      `TODO.md` item 4 closed "Additional languages" as infeasible because Groq Whisper
      offers only one fixed language or auto-detect. That constraint does not apply to
      AssemblyAI, which recognizes 18 input languages with native code-switching. There is
      now a real backend for a discrete multi-language control, for agents on that
      provider. Note the asymmetry: 18 languages in, only 6 spoken out.
- [ ] **Register the `session.completed` webhook subscription** (added: 2026-09-06) — pure
      latency optimization, not required. Hangup already queues a job that polls
      `GET /v1/sessions/{id}`, which is why local dev needs no tunnel. Registering the
      webhook (`POST /v1/webhook-subscriptions`, secret must match
      `ASSEMBLYAI_WEBHOOK_SECRET`) just makes transcripts appear sooner.
- [ ] Auto-capture unanswered questions and suggest FAQ entries
- [ ] Move conversations filters to server-side query params for scale
- [ ] Improve `phone` and `chat` channel coverage in conversation flows

## P1 - Telephony + Integrations

- [ ] Twilio inbound phone path to LiveKit SIP flow
- [ ] Plivo inbound phone path to LiveKit SIP flow
- [ ] Add outbound API/webhook key model for external automation

## P2 - UX + Platform

- [ ] Calendar per-slot buffer time support
- [ ] Notification center UI (header popover currently shell)
- [ ] Billing/upgrade flow behind sidebar upgrade card
- [ ] Enforce TOTP at login: after password sign-in, check
      `getAuthenticatorAssuranceLevel()` and require the code before the session counts
      (enrollment shipped in `98692e0`; login does not challenge yet)

---

## Known Technical Issues

- [ ] **Pre-existing test failures** (recorded 2026-10-08): 10 tests across
      `app/smb/actions.test.ts`, `lib/data/analytics.test.ts`,
      `lib/data/availability-engine.test.ts` (date/timezone fixtures), and
      `lib/voice/adapters/fish-audio-tts.test.ts`. Present on `main` since at least
      `9dfb2d8`.
- [ ] **Pre-existing lint errors** (recorded 2026-10-08): `pnpm lint` reports 29 errors,
      4 warnings — down from ~2100 in August. Clear them so full-repo lint becomes a gate again.
- [ ] Fix TypeScript errors in `app/smb/actions.ts` (`parsed.data` undefined cases)
      — **may be stale** (checked 2026-09-06, again 2026-10-08): repo-wide `pnpm tsc --noEmit` is
      clean, so this no longer reproduces as a type error. Either fixed already or hidden
      behind a cast; worth confirming before someone spends time hunting it.
- [ ] Fix type mismatch issues in `lib/data/knowledge-service.ts` around `RankedChunkHit`
      — **may be stale** (checked 2026-09-06, again 2026-10-08): same as above, `tsc --noEmit` reports clean.
- [ ] **AssemblyAI recordings are OGG/Opus** (added: 2026-09-06) — their Sessions API returns
      OGG, whereas the LiveKit path deliberately records MP3 because OGG cannot be decoded
      by `decodeAudioData` in Chromium and does not play in Safari (see the comment in
      `lib/voice/recording.ts`). Consequence for AssemblyAI conversations: the waveform
      falls back to flat, which `CallAudioPlayer` already handles gracefully, and Safari
      cannot play them at all. Fixing properly means transcoding, which would add ffmpeg to
      the worker image — deliberately not done. Revisit if Safari playback matters.
- [ ] **`CallAudioPlayer` download filename hardcodes `.mp3`** (added: 2026-09-06) — the
      `downloadFilename ?? 'call-recording.mp3'` fallback gives an AssemblyAI recording the
      wrong extension on download. Cosmetic; the file itself is valid OGG.

---

## Completed Recently

- [x] Google Calendar OAuth + encrypted token storage + sync on appointment
      create/update/cancel (`lib/integrations/google-calendar-sync.ts`, migration `038`);
      Microsoft Calendar, Cal.com, and Calendly followed the same pattern (`039`, `040`)
- [x] Consolidated the four BullMQ worker processes into one `workers/jobs.ts` host
      (`6f648ce`); `WORKER_QUEUES` splits a queue back out without code changes
- [x] TOTP 2FA enrollment + sign-out-all-devices in settings (`98692e0`)
- [x] Verified the AssemblyAI wire protocol against the live API and fixed three bugs that
      typecheck, lint, and the build had all missed. Every one came from trusting prose
      documentation, and every one would have shipped broken:
      1. `input.voice_focus_threshold` is rejected unless `input.voice_focus` is also sent,
         despite the docs saying `voice_focus` defaults to `near-field`. This failed the
         session before `session.ready`, so **every call by an agent with "filter
         background speech" enabled would have died on connect.**
      2. The recording artifact's `type` is `audio`, not `recording` (the URL path is
         `recording/audio.ogg`, which is what made `recording` look right). The lookup
         found nothing, so **no recording would ever have been stored.**
      3. The REST session object exposes `duration_seconds`. `session_duration_seconds` and
         `audio_duration_seconds` exist only on the `session.ended` *WebSocket* event, so
         **every conversation would have shown a duration of 0:00.**
      Also corrected the timeline shape: turns have no `started_at_ms`. They carry
      `user_speech_started_at_ms` and `agent_reply_started_at_ms` separately, with the
      session zero point at top-level `started_at_unix_ms` — the inferred version collapsed
      every transcript timestamp to 0, silently breaking transcript-to-audio seeking.
      Added `timeline.test.ts` (7 tests) around a verbatim captured artifact.
- [x] Added AssemblyAI Voice Agent API as a per-agent switchable voice provider
      (`agents.voice_provider`), alongside the existing LiveKit pipeline which stays the
      default — commits `76f70f3` (provider-neutral tool extraction) and `8404deb`.
      Protocol-verified, but no browser call has run yet; see the P0 items above.
- [x] Added calendar block edit/cancel flows
- [x] Added call recording persistence + playback path
- [x] Added compact shared filter button patterns
- [x] Added Knowledge Sources + FAQ management UI and indexing workflow
- [x] Added voice tab cleanup and advanced settings model updates

---

## References

- Architecture guide: `developer-docs/ARCHITECTURE.md`
- Main setup guide: `README.md`
