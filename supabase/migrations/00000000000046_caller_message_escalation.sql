-- Lets a caller message record *who asked for a human and how urgently*, which
-- the `take_message` voice tool needs and the existing rows could not express.
--
-- `caller_messages` (migration `009`) was built for one producer:
-- `updateConversationStatus` in `lib/data/conversations-service.ts`, which
-- synthesizes a row after the fact when a call ends `failed` or with a failed
-- call goal. Those rows are inferred from a transcript, so they carry no
-- urgency and no provenance. A message the agent took on purpose — because the
-- caller asked to speak to a person — is a different thing, and a human
-- triaging the Messages tab needs to tell them apart.
--
-- Two columns rather than a second table: the Messages tab, the unread count in
-- the sidebar, the mark-as-read actions, and `createContactFromMessage` all
-- already read `caller_messages`. A parallel `escalations` table would mean a
-- second inbox nobody checks.
--
-- No new RLS policies: the four org-scoped policies on `caller_messages` are
-- table-wide and cover these columns as they stand (they follow the
-- `organization_id in (select organization_id from members where
-- user_id = auth.uid())` pattern used throughout).

alter table caller_messages
  add column if not exists urgency text not null default 'normal'
    check (urgency in ('low', 'normal', 'high'));

-- 'call_followup' is the inferred, end-of-call row that already existed, so
-- backfilling every current row to it is correct rather than merely convenient.
alter table caller_messages
  add column if not exists source text not null default 'call_followup'
    check (source in ('call_followup', 'agent_escalation'));

-- The Messages tab sorts newest-first per org, and urgent escalations are what
-- a human goes looking for first.
create index if not exists caller_messages_org_created_idx
  on caller_messages (organization_id, created_at desc);
