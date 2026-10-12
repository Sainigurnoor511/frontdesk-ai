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
  -- Stamped by the worker *before* it sends, and cleared again only if the whole
  -- send request failed. Non-null means "an email for this notification is out,
  -- or is being sent right now".
  email_sent_at timestamptz,
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

create policy "Members can view their organization's notifications"
  on notifications for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create notifications in their organization"
  on notifications for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's notifications"
  on notifications for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's notifications"
  on notifications for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
