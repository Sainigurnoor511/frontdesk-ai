# Frontdesk.ai — Remaining Work

Tracks gaps found against `docs/FrontDesk.ai_Design_Document_Page_4_Claude_Code_Guide.md`'s
11-phase implementation order (audited 2026-08-25). `docs/` is gitignored, so that file exists
only in local checkouts. The ongoing team backlog lives in `developer-docs/TODO.md`. Update this file as items complete.

## Queue

- [ ] **7. E2E / load testing pass** (Phase 11)
      No integration/E2E harness beyond unit tests + voice-latency instrumentation.
      Scope TBD — Playwright is already a devDependency but unused so far.

## Done

- [x] **1. Finish & commit in-progress voice pipeline work** (Phase 5 polish) — commit `9dfb2d8`.
      Fixed a real bug found in review: `livekit-room.ts` passed a plain object where
      `@livekit/protocol`'s `RoomAgentDispatch` (a protobuf `Message` subclass) was required —
      typechecked clean before the fix but would have failed at runtime. Typecheck, lint, and
      test suite all verified (4 pre-existing unrelated test failures confirmed present on
      baseline `main` via stash-compare, not caused by this work — see fish-audio-tts.test.ts,
      analytics.test.ts, availability-engine.test.ts, app/smb/actions.test.ts).

- [x] **2. Phone Numbers page** (Phase 4 gap) — commit `37c90c3`.
      Purchase/release/block stayed agent-scoped (that flow already worked); the page adds
      an org-wide list across agents with search and a reassign dropdown (new org-scoped
      `reassignPhoneNumber` action + `getPhoneNumbersForOrg` in `lib/data/phone-numbers.ts`),
      plus a sidebar nav entry. Typecheck, lint, and a dev-server route check (redirects to
      /login unauthenticated, no compile errors) all verified.

- [x] **3. Settings: real 2FA (TOTP) + sign-out-all-devices** — commit `98692e0`.
      Password reset was already wired up (the old inline TODO comment claiming otherwise
      was stale — removed it). Built: `enrollTotpFactor`/`verifyTotpEnrollment`/
      `unenrollTotpFactor`/`getTotpFactorStatus` server actions using Supabase's real MFA
      API (`supabase.auth.mfa.*`), a QR-code + 6-digit-code enroll dialog and disable
      confirmation in the settings UI, and `signOutAllDevices` using `signOut({scope:
      'global'})` to revoke every refresh token (previously only signed out the current
      session). 9 new tests added, all passing; full suite shows only the 4 pre-existing
      unrelated failures.
      **Follow-up not done in this pass:** no login-time AAL2 challenge — a user with TOTP
      enrolled can still complete `signInWithPassword` without being asked for a code. Real
      enforcement needs a challenge step wired into the login flow (check
      `getAuthenticatorAssuranceLevel()` after password sign-in, redirect to a
      verify-code screen if a higher AAL is required before considering the session
      complete).

- [x] **4. Agent detail: language section** — commit `beacf87`.
      The "Additional languages" button was a disabled stub; Groq Whisper STT only supports
      one default language OR auto-detect (no discrete multi-language list exists in the
      API), so there was nothing real to build behind that control. Removed it and wired
      the already-present "Detect language" toggle end-to-end instead: new `detect_language`
      boolean column (migration `042`), threaded through `updateAgentGeneral`, and consumed
      in `workers/voice-agent.ts` via `OpenAISTT.withGroq({ detectLanguage: true })` (falls
      back to the fixed default language otherwise). Typecheck, agent tests (29/29), lint,
      and a dev-server route check all verified.

- [x] **5. Agent detail: rules engine** — commit `ae60c5c`.
      No structured rule evaluator exists anywhere in the codebase — receptionist behavior
      is entirely prompt-based (the LLM reads free-text instructions and decides at
      runtime). Scoped to: a rule is a structured `{trigger, action}` pair ("When {trigger},
      {action}") persisted in a new `agent_rules` table, editable via a real list/add/edit/
      delete/enable-toggle UI (`rules-tab.tsx`), and compiled into the voice session's
      system prompt as a "Rules to follow on every call" block
      (`lib/voice/agent-context.ts`'s `buildSystemPrompt`, fed by a new service-role read in
      `workers/voice-agent.ts`). Not a separate deterministic engine — the LLM still decides
      at runtime, same as every other instruction field.
      Typecheck and agent tests (29/29) verified. **Note:** discovered `pnpm lint` on bare
      `main` already reports 2127 pre-existing errors repo-wide (unrelated files like
      `waveform.tsx`, `use-mobile.ts`, `lib/crawler/crawl.ts`) — confirmed via
      stash-compare, not caused by this session's work. Full-repo `pnpm lint` is no longer a
      reliable gate (2026-10-08: down to 29 errors, still not zero); verify with `pnpm exec eslint <changed files>` scoped to just the
      touched paths instead.

- [x] **6. Staff presence: "Available now" filter** — commit `fab0221`.
      Split the two filters on their actual backend feasibility: "In session" needs new
      schema (nothing links a live call to a staff member) plus live-call-state tracking —
      left disabled with an honest tooltip instead of "coming soon". "Available now" needed
      no new schema — added `getStaffAvailabilityNow` to the availability engine (staff-hours
      override, falling back to business hours, minus active time-off, evaluated against the
      current moment in the org's IANA timezone via `Intl.DateTimeFormat`) and wired it into
      the staff page as a real filter + per-row badge.
      Typecheck, scoped lint, and staff tests (6/6) verified. Confirmed via stash-compare
      that `availability-engine.test.ts`'s 6 failures are pre-existing on baseline `main`
      (date-fixture/timezone flakiness unrelated to this change), not a regression.
