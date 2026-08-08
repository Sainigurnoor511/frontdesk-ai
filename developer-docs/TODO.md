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

- [ ] Google Calendar OAuth + token storage + sync on create/cancel
- [ ] Enforce `answering_mode`/routing logic in `workers/voice-agent.ts`
- [ ] Add voice tools: cancel appointment, reschedule appointment
- [ ] Wire feature flags to sidebar visibility and route guards
- [ ] Implement notification delivery from stored prefs (`organization_settings`)

## P1 - Knowledge + Conversations

- [ ] Support PDF/DOCX knowledge uploads (in addition to txt/md/html)
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
- [ ] Fix type mismatch issues in `lib/data/knowledge-service.ts` around `RankedChunkHit`

---

## Completed Recently

- [x] Added calendar block edit/cancel flows
- [x] Added call recording persistence + playback path
- [x] Added compact shared filter button patterns
- [x] Added Knowledge Sources + FAQ management UI and indexing workflow
- [x] Added voice tab cleanup and advanced settings model updates

---

## References

- Architecture guide: `developer-docs/ARCHITECTURE.md`
- Main setup guide: `README.md`
