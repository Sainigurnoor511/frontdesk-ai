create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type text not null check (
    type in ('post_call_summary', 'appointment_reminder', 'client_booking', 'staff_booking')
  ),
  -- All three content columns are `not null`: every writer is in this feature and
  -- every one of the four types has a title, a body (with a fallback string when
  -- the source datum is null) and a list page to link to.
  title text not null,
  body text not null,
  link_path text not null,
  -- Natural key of the subject: a conversation id or an appointment id. With
  -- `type` it is what makes delivery idempotent.
  dedupe_key text not null,
  is_read boolean not null default false,
  -- Durable: stamped only once Resend has accepted the submission (or told us
  -- the idempotency key was already used). Non-null means "an email for this
  -- notification reached the provider", and nothing re-sends it.
  email_sent_at timestamptz,
  -- The expiring delivery lease, split from the durable timestamp above so a
  -- worker that dies between taking the lease and reaching Resend does not look
  -- delivered. `email_claim_token` is the BullMQ job id that holds it, which is
  -- what lets a retry of the same job re-take its own lease immediately while
  -- still excluding a different worker until the lease ages out.
  email_claimed_at timestamptz,
  email_claim_token text,
  created_at timestamptz not null default now()
);

create unique index notifications_dedupe_idx
  on notifications (organization_id, type, dedupe_key);

create index notifications_org_created_idx
  on notifications (organization_id, created_at desc);

create index notifications_org_unread_idx
  on notifications (organization_id, is_read)
  where is_read = false;

-- The conversation-completed seam looks up appointments booked during a call.
create index if not exists appointments_conversation_id_idx
  on appointments (conversation_id)
  where conversation_id is not null;

alter table notifications enable row level security;

-- Notifications are authored by the worker on the service-role client, never by
-- a member. The session client gets exactly two capabilities: read its own org's
-- rows, and flip `is_read`. Deliberately *not* the insert/update/delete set the
-- `caller_messages` policies grant — a member who can insert here can make a
-- notification appear in every teammate's bell, and a member who can update any
-- column can defeat deduplication or set `email_sent_at` to suppress a real
-- email.
create policy "Members can view their organization's notifications"
  on notifications for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

-- RLS cannot restrict *which* columns an update touches, so the column list is
-- enforced with grants below; this policy restricts which rows, and `with check`
-- stops a row being moved to another organization.
create policy "Members can mark their organization's notifications as read"
  on notifications for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

-- Supabase's default privileges hand `anon` and `authenticated` full DML on new
-- public tables, which RLS then filters by row. Take the table-wide grants back
-- and re-grant update on `is_read` alone. The worker is unaffected:
-- `service_role` bypasses both RLS and these grants.
revoke all on notifications from anon;
revoke insert, update, delete, truncate, references on notifications from authenticated;
grant select on notifications to authenticated;
grant update (is_read) on notifications to authenticated;
