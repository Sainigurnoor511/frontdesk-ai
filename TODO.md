# Frontdesk.ai — Remaining Work

Tracks gaps found against `docs/FrontDesk.ai_Design_Document_Page_4_Claude_Code_Guide.md`'s
11-phase implementation order (audited 2026-08-25). Update this file as items complete.

## Queue



- [ ] **4. Agent detail: multi-language selection tab**
      `app/(dashboard)/agents/[id]/agent-detail-client.tsx:714` — placeholder UI.

- [ ] **5. Agent detail: rules engine tab**
      `app/(dashboard)/agents/[id]/agent-detail-client.tsx:787` — placeholder UI.

- [ ] **6. Staff live-presence tracking**
      `app/(dashboard)/staff/staff-client.tsx:87,207,217` — filter UI has no backend.

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
