# Frontdesk.ai Shared TODO

The single team-wide feature and technical backlog. The old root `TODO.md` (a phase-by-phase
audit against the original design document, 2026-08-25) was folded in here on 2026-10-12 —
10 of its 11 items had shipped; the one that had not is the E2E/load testing pass under
P2 below.

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
      `getPublicAgentsForOrg` were not touched). The migration file is committed on `main`
      (`8404deb`) and CI applies it on merge, so this is now only an action for local and
      self-hosted databases provisioned before `044`: run `npx supabase db push`.
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
- [ ] Wire feature flags to sidebar visibility and route guards
- [x] Implement notification delivery from stored prefs (`organization_settings`) —
      shipped 2026-10-13, see Completed Recently

## P1 - Knowledge + Conversations

- [ ] **Revisit multi-language support for AssemblyAI agents** (added: 2026-09-06) — the
      "Additional languages" control was removed in `beacf87` as infeasible because Groq Whisper
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

## P1 - Public booking page hardening

Opened 2026-10-12 out of the semantic review of the voice cancel/reschedule tools. The
voice tools' identification rule (organization + a caller-confirmed email) is justified by
parity with the public manage-booking page, so the page's own controls are load-bearing for
both surfaces.

- [ ] **Rate-limit the public manage-booking actions** (added: 2026-10-12) —
      `lookupPublicAppointments`, `reschedulePublicAppointment`, and
      `cancelPublicAppointment` in `app/smb/actions.ts` carry no
      `checkAndConsumeRateLimit`, unlike `createPublicAppointment`
      (`MAX_BOOKINGS_PER_HOUR_PER_IP`). Email is the only credential, so the lookup is an
      unthrottled email-keyed enumeration oracle for appointment titles and times. An
      earlier docstring on `getUpcomingAppointmentsByEmailServiceRole` claimed these were
      "rate-limited by caller"; the comment has been corrected, the rate limit has not been
      added.
- [ ] **The Turnstile guard on the booking actions is dead code** (added: 2026-10-12) —
      both blocks run under `if (false && turnstileSecret)` (see the `showTurnstile` note in
      `booking-page-public-client.tsx`). Either revive it or delete it; leaving a disabled
      bot check that reads as enabled is worse than neither.
- [ ] **Concurrent *new* bookings can still overlap a reschedule** (added: 2026-10-12) —
      migration `045`'s `reschedule_appointment_atomic` takes an org-scoped advisory lock
      and re-checks the destination, which closes reschedule-vs-reschedule and
      reschedule-vs-cancel. `createAppointmentServiceRole` does not take that lock, so an
      insert committing between a reschedule's overlap check and its write is still
      invisible. Closing it means routing inserts through the same lock, or an overlap
      exclusion constraint on `appointments` — note the latter would also forbid overlaps
      that existing data may already contain, since nothing enforces non-overlap today.
- [ ] **No email when an appointment is cancelled or moved** (added: 2026-10-12, explicit
      decision) — a new booking sends `sendAppointmentConfirmationEmail`; cancel and
      reschedule send nothing on either the voice or the web path, so a caller whose
      appointment moved has only the spoken confirmation and no record of the new time. Not
      an oversight as of this entry, but it should be a deliberate omission on the record
      rather than an implicit one. Fix by adding templates under `lib/email/`.
- [ ] **`appointment.updated` is not an outbound webhook event** (added: 2026-10-12) — it
      is absent from `WEBHOOK_EVENT_TYPES`, so a reschedule dispatches no webhook at all
      while a cancel dispatches `appointment.cancelled`. Downstream integrations see a move
      as nothing happening. Adding it is a standalone change.
- [ ] **No verification tool exists for secure-mode agents** (added: 2026-10-12) —
      `manageBookingToolsAllowed()` in `lib/voice/tool-handlers.ts` withholds
      `find_appointment` / `cancel_appointment` / `reschedule_appointment` from any agent
      with `secure_mode` or `identity_verification_enabled` on, because a caller-spoken
      email is the only credential those tools have and nothing in the shared handler set
      can verify a caller. Those agents therefore cannot manage existing appointments by
      voice at all. Lifting the restriction needs caller ID on `conversations` or an OTP
      flow as a real voice tool, not a sentence in the system prompt.

## P1 - Telephony + Integrations

- [ ] Twilio inbound phone path to LiveKit SIP flow
- [ ] Plivo inbound phone path to LiveKit SIP flow
- [ ] **Enforce `answering_mode` / call routing in `workers/voice-agent.ts`** (moved here
      from P0 on 2026-10-13, after the feasibility investigation in
      `.agents/tasks/answering-mode-feasibility.md`) — **a dependent of the two LiveKit SIP
      items above, not a worker bug.** `staff_first` means "ring a human on the PSTN before
      the AI answers", and there is no PSTN leg to ring or intercept: every call today is a
      browser WebRTC session the caller started by clicking a button. Verified blockers:
      - No **LiveKit SIP outbound trunk**. `livekit-server-sdk@^2.17.0` already exports
        `SipClient` and `TransferSipParticipantOptions`, so no new dependency is needed —
        but LiveKit Cloud SIP (or a self-hosted `sip` service) has to be enabled, a trunk
        created via `createSipOutboundTrunk`, and its id added as a new env var. No SIP env
        var exists in `.env.example` and no `SipClient` call site exists in the repo.
      - No **SIP trunk provider account with outbound voice** and no verified outbound
        caller ID, which is what dialling `staff_phone_number` would need.
      - No **inbound path at all**: `provisionTwilioNumber` only *purchases* a number and
        never sets a `VoiceUrl` or SIP origination URI, and there is no
        `createSipInboundTrunk` / `createSipDispatchRule`. Without inbound there is no call
        to route, so `answering_mode` has nothing to decide.
      - Cost is a product decision, not a blocker: Interpretation A (dial the staff number
        into the room on every call) bills a PSTN leg per web visitor.
      The setting is already labelled inactive in the UI (the `bg-warning-subtle` banner at
      `agent-detail-client.tsx:827`), so this is parked rather than dishonest. The adjacent
      fields in the same cluster are inert for the same reason and ship with it:
      `max_ring_seconds`, `hold_music` *and* `hold_sound` (two overlapping fields, no
      playback path and no assets for either — pick `hold_sound`, the enum one), and
      `blocked_phone_numbers` (CRUD only; a browser call carries no caller number to match).
      The unblocked half of this story — taking a message for a human — shipped; see
      Completed Recently.
- [ ] **Notify the org about a new caller message by email** (added: 2026-10-13, scoped
      2026-10-13) — `take_message` dispatches the `caller_message.created` outbound webhook,
      which was the only org-wide delivery path when it shipped. An org that has not
      configured a webhook learns about an escalated caller only by opening the Messages
      tab. Notification delivery has now landed, so the call site in
      `lib/voice/tools/escalation-handlers.ts` should gain a `dispatchNotification()`
      alongside the webhook — alongside, not instead of, and not a second email sender of
      its own.
      **Why it is still open:** reuse is not a wiring change. `dispatchNotification()`
      takes a `NotificationEvent`, and every one of the four types resolves to a
      `notify_*` column in `organization_settings`, a branch in
      `buildNotificationContent()`, and a subject loader that reads either a conversation
      or an appointment. A `caller_message` type needs a fifth preference column (migration
      + the organization settings form), a fifth content branch, a `caller_messages` subject
      loader, and a `link_path` added to the notification allow-list
      (`lib/notifications/link-path.ts`). That is a feature, not the small addition this
      item assumed, so it was deliberately left out of the notification-delivery review
      fixes rather than half-wired.
- [ ] **Each notification costs one Auth admin round trip per member** (added: 2026-10-13,
      from the notification-delivery semantic review, issue 11) — `members` carries no email
      column, so `getOrgRecipients()` resolves every `user_id` through
      `auth.admin.getUserById`, ten at a time, capped at 50, with no caching between jobs. A
      50-member org pays 50 Auth round trips per notification, and a burst of bookings can
      hit Auth rate limits. Not fixed with a process-local cache on purpose: the worker runs
      multiple containers and a stale cache mails a former address, so the right fix is
      denormalizing the email onto `members` and keeping it in sync (a migration plus a sync
      path on signup and email change), which is bigger than the review that found it.
- [ ] **The LiveKit path ignores `filter_background_speech`** (added: 2026-10-13,
      investigated 2026-10-13 — see `.agents/tasks/filter-background-speech-livekit.md`) —
      honoured on the AssemblyAI path (`session-config.ts` sends `voice_focus` +
      `voice_focus_threshold`), but `workers/voice-agent.ts` never reads the field. A
      per-provider gap, unrelated to routing. **Blocked on a paid dependency**, so the
      switch is now labelled inactive for the default engine in the agent's Advanced tab
      (`advanced-settings-tab.tsx`) rather than silently doing nothing. What the
      investigation established, so nobody repeats it:
      - `@livekit/agents@1.6.1` only *passes through* noise cancellation: `RoomInputOptions`
        (and `session.start({ inputOptions })`) accepts
        `noiseCancellation?: NoiseCancellationOptions | FrameProcessor<AudioFrame>`, and
        `NoiseCancellationOptions` from `@livekit/rtc-node@0.13.33` is just
        `{ moduleId, options }` resolved against an `AudioFilter(moduleId, path)` native
        library. The framework ships no filter of its own, and neither does
        `@livekit/local-inference@0.2.6` (VAD + EOT only). Nothing installed can honour the
        setting.
      - Supplying a filter means a new dependency with platform binaries, one of:
        `@livekit/noise-cancellation-node@0.3.0` (Krisp; `krisp.voiceIsolation()` /
        `krisp.voiceIsolationTelephony()`, runtime `setNoiseSuppressionLevel`, LiveKit ToS
        licence) or `@livekit/plugins-ai-coustics@0.3.4` (ai-coustics Voice Focus 2.1 S/L,
        plus a `*-<platform>` binary package each for linux/darwin/windows).
      - Both default to authenticating and metering through **LiveKit Cloud**, and the
        voice-isolation models — the actual equivalent of AssemblyAI's `voice_focus`, which
        is near-field speaker isolation rather than plain noise suppression — are a
        **paid add-on** (background *noise* suppression is included with Cloud; voice
        isolation is not). Self-hosting the SFU is only viable with the ai-coustics plugin,
        which can take a direct ai-coustics licence key via `auth` and bill there instead —
        that is the new env var this would add (no other config needed; `LIVEKIT_URL`,
        `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` already exist).
      - Cheaper near-miss, deliberately not taken: `turnHandling.interruption.mode:
        'adaptive'` (currently pinned to `'vad'` in `workers/voice-agent.ts`) runs
        LiveKit's ML barge-in classifier and would stop background speech from
        *interrupting* the agent. It needs no new package but does call LiveKit's inference
        gateway over a WebSocket with `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`
        (`inference/interruption/interruption_detector.js`), so it is Cloud-billed too, it
        changes turn-taking feel for every call, and it never cleans the audio the STT
        sees. Not the same feature.
      So: either accept a paid Cloud add-on and wire
      `session.start({ inputOptions: { noiseCancellation: … } })` to the agent's flag, or
      keep the switch AssemblyAI-only.
- [ ] Add outbound API/webhook key model for external automation

## P2 - UX + Platform

- [ ] **E2E / load testing pass** (moved from root `TODO.md`, audited 2026-08-25, rechecked
      2026-10-12) — nothing exists beyond unit tests and the voice-latency instrumentation.
      `@playwright/test` is a devDependency but there is no Playwright config and no spec
      files, so the harness has to be set up from scratch. Scope TBD; the obvious first
      targets are the signup → onboarding → agent-create path and the public booking page.
- [ ] Calendar per-slot buffer time support
- [x] Notification center UI (header popover currently shell) — shipped 2026-10-13, see
      Completed Recently
- [ ] Billing/upgrade flow behind sidebar upgrade card
- [ ] Enforce TOTP at login: after password sign-in, check
      `getAuthenticatorAssuranceLevel()` and require the code before the session counts
      (enrollment shipped in `98692e0`; login does not challenge yet)

---

## Known Technical Issues

- [ ] **Pre-existing test failures** (recorded 2026-10-08, narrowed 2026-10-12): now **4**
      tests — 2 in `lib/data/analytics.test.ts` and 2 in
      `lib/voice/adapters/fish-audio-tts.test.ts`. The 6 in
      `lib/data/availability-engine.test.ts` were fixed on 2026-10-12: they were not a
      timezone problem but a stale clock, asserting slot lists that the engine's
      `minimum_booking_notice_minutes` filter empties once the 2026-08-10 fixture date is in
      the past. Pinning the system time in that suite's `beforeEach` restored them, and
      they now cover staff scoping and service duration as well. `app/smb/actions.test.ts`
      passes and had already stopped failing before this.
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

- [x] **Notification delivery from stored preferences, plus the header notification
      center** (2026-10-13) — the four `notify_*` toggles in `organization_settings` now
      actually deliver. `dispatchNotification()` / `scheduleAppointmentReminder()`
      (`lib/notifications/dispatch.ts`) enqueue onto the new `notification-deliver` queue;
      `lib/queue/processors/notification.ts` re-reads the preference and the subject at
      delivery time, claims a row in the new `notifications` table (migration `047`,
      deduplicated on `(organization_id, type, dedupe_key)`), and fans one
      `resend.batch.send` out to the org's members. Four types: post-call summary, client
      booking, staff booking, and a 24h-before appointment reminder enqueued as a delayed
      job. The header bell reads through a server action on open and on window focus.
      Semantic review (two models, 20 issues) found four High ones, all fixed here: a
      reschedule left the reminder at the old time because a fixed BullMQ job id makes a
      re-add a no-op — installs go through `addNotificationJob()`, which clears the stale
      job, and every path that moves or cancels `starts_at` calls it, including the voice
      cancel/reschedule tools; `email_sent_at` was stamped before the Resend call, so a
      crash in that window looked delivered and was never retried — the pre-send write is
      now an expiring lease and the durable stamp lands only once the provider accepts; the
      migration had copied `caller_messages`' policy set, letting any member forge, rewrite
      or delete notifications — members now get select plus a column-level `is_read` update
      grant, and `link_path` is allow-listed at render; and a transient Auth lookup failure
      silently dropped recipients forever — a 404 is skipped, anything else throws so the
      job retries. Also: the `client_booking` hourly cap is charged once per notification
      rather than once per attempt and a capped email is re-enqueued past the window
      instead of dropped, and the worker asserts `NEXT_PUBLIC_SITE_URL` so it cannot mail
      `localhost` links. Read state is one flag on an org-scoped row, matching
      `conversations` and `caller_messages` — a shared inbox, on purpose; per-member read
      state would need a `notification_reads` join table.
- [x] **Added the `take_message` voice tool** (2026-10-13) — closes the gap where the
      receptionist promised a human handoff it had no tool to perform. The UI advertises
      transfers (the Transfer rules section on the agent detail page, the "Handoff to a
      human" rule card) and `agent_rules` reach the model as free prose, so the model could
      already *say* it would put a caller through. New
      `lib/voice/tools/escalation-handlers.ts` captures caller name, callback number,
      reason, and caller-expressed urgency (`lib/validations/caller-message.ts`, a bare
      `ZodObject` so both providers accept it; the digit-count check on the callback number
      is in `execute`, where a `.refine()` cannot break the schema). Registered last and
      ungated in `buildVoiceToolHandlers()`, so both engines pick it up — LiveKit through
      `livekit-tools.ts`, AssemblyAI through `session.tools` — and a secure-mode agent with
      no manage-booking tools still has it, which is what makes the existing "offer to take
      a message" sentence in `buildSystemPrompt()` true. Persisted to `caller_messages`
      against the call's `conversation_id` rather than a new table: that row already drives
      the Messages tab, the sidebar unread badge, mark-as-read, and
      `createContactFromMessage`, so a parallel `escalations` table would have been a second
      inbox nobody opens. Migration `046` adds `urgency` and `source` to the table (existing
      rows backfill to `call_followup`, the inferred end-of-call message) and the Messages
      tab now labels and badges the two apart. `buildSystemPrompt()` gained a paragraph
      stating there is no live transfer and that a handoff rule means take a message —
      without it the model narrates a transfer that cannot happen. Notification reuses
      `dispatchWebhook` with a new `caller_message.created` event; the email gap is the P1
      item above. Explicitly **not** built: ringing a staff phone, SIP, warm transfer,
      bridging, any `answering_mode` enforcement — all blocked on telephony, see P1.
- [x] Added `find_appointment`, `cancel_appointment`, and `reschedule_appointment` voice
      tools in a new sibling module `lib/voice/tools/manage-booking-handlers.ts` (not
      `booking-handlers.ts`), reusing the public manage-booking service path so calendar
      sync and the `appointment.cancelled` webhook fire identically, and routed the LiveKit
      worker through `buildVoiceToolHandlers()` (new `lib/voice/livekit-tools.ts`, replacing
      `booking-tools.ts` + `knowledge-tools.ts`) so both providers share one tool list by
      construction. Authorization is organization + a caller-confirmed email, the same
      strength the public manage-booking page already offers. Deliberately left out:
      caller-ID/OTP identification, and `appointment.updated` as an outbound webhook event
      (not in `WEBHOOK_EVENT_TYPES`, so reschedule fires none — parity with the public page).
- [x] Fixed the review findings on those tools (2026-10-12). The four High items:
      the manage-booking tools are now **withheld in code** from any agent with
      `secure_mode` or `identity_verification_enabled` on
      (`manageBookingToolsAllowed()` in `lib/voice/tool-handlers.ts`) rather than
      discouraged by a prompt sentence that said the opposite; reschedule passes the
      appointment's stored `service_id` and `staff_id` to the availability engine instead of
      blanks; `getAvailableSlots()` throws on any Postgres read error instead of reading a
      failed query as an empty table and quietly removing blockers; and both mutations are
      now conditional on the start time the caller confirmed, with reschedule going through
      `reschedule_appointment_atomic` (migration `045`) so the destination overlap check and
      the write share one transaction and an org-scoped advisory lock. Also: the lookup
      splits into a forward query plus a bounded lookback so recent history cannot crowd out
      real upcoming appointments; disambiguation candidates exclude cancelled and past rows;
      offered alternatives exclude the appointment's own current time; and the public
      reschedule passes `excludeAppointmentId` so the same move no longer succeeds by voice
      and fails on the web. The residual gaps are the P1 "Public booking page hardening"
      section above.
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
