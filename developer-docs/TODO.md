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
      `pnpm start:assemblyai`, or the `worker-assemblyai` service in `docker-compose.yml`.
      Without it, AssemblyAI calls complete but their conversations stay `active` forever
      and never get a transcript, summary, or recording.
- [ ] **Verify an AssemblyAI call end to end against live audio** (added: 2026-09-06) — none
      of the runtime path has been exercised; only typecheck, scoped lint, and the build
      were verified. Confirm: token mint, greeting plays, barge-in interrupts cleanly, a
      booking tool call round-trips through the server action, and the transcript,
      summary, and recording land on the conversation. Test in Firefox and Safari too —
      the in-worklet resampling exists specifically because those two break the
      forced-24 kHz shortcut, and that fix is unverified.
- [ ] Google Calendar OAuth + token storage + sync on create/cancel
- [ ] Enforce `answering_mode`/routing logic in `workers/voice-agent.ts`
- [ ] Add voice tools: cancel appointment, reschedule appointment
      (now provider-neutral: add to `lib/voice/tools/booking-handlers.ts` once and both
      the LiveKit and AssemblyAI paths pick it up)
- [ ] Wire feature flags to sidebar visibility and route guards
- [ ] Implement notification delivery from stored prefs (`organization_settings`)

## P1 - Knowledge + Conversations

- [ ] **Timeline fixture test for `timelineToTranscript`** (added: 2026-09-06) — highest-risk
      piece of the AssemblyAI integration. `reply.audio`'s payload field was confirmed
      against AssemblyAI's AsyncAPI spec (it is `data`, not `audio`), but the session
      *timeline* shape is only documented in prose, so the field names in
      `lib/voice/providers/assemblyai/timeline.ts` are inferred. If they are wrong,
      transcripts come back empty while every other part of the call looks healthy. The
      function is pure — capture one real timeline artifact as a fixture and assert the
      mapping, including the documented edge cases: a null `user_transcript` on the
      greeting turn, and turns with neither transcript nor agent text.
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
- [ ] 2FA implementation in settings

---

## Known Technical Issues

- [ ] Fix TypeScript errors in `app/smb/actions.ts` (`parsed.data` undefined cases)
      — **may be stale** (checked 2026-09-06): repo-wide `pnpm tsc --noEmit` is currently
      clean, so this no longer reproduces as a type error. Either fixed already or hidden
      behind a cast; worth confirming before someone spends time hunting it.
- [ ] Fix type mismatch issues in `lib/data/knowledge-service.ts` around `RankedChunkHit`
      — **may be stale** (checked 2026-09-06): same as above, `tsc --noEmit` reports clean.
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

- [x] Added AssemblyAI Voice Agent API as a per-agent switchable voice provider
      (`agents.voice_provider`), alongside the existing LiveKit pipeline which stays the
      default — commits `76f70f3` (provider-neutral tool extraction) and `8404deb`.
      Ships code-complete but **unverified at runtime**; see the P0 items above before
      treating it as working.
- [x] Added calendar block edit/cancel flows
- [x] Added call recording persistence + playback path
- [x] Added compact shared filter button patterns
- [x] Added Knowledge Sources + FAQ management UI and indexing workflow
- [x] Added voice tab cleanup and advanced settings model updates

---

## References

- Architecture guide: `developer-docs/ARCHITECTURE.md`
- Main setup guide: `README.md`
