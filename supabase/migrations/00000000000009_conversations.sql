create table conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  channel text not null default 'voice_web' check (channel in ('voice_web', 'phone', 'chat')),
  outcome text not null default 'successful' check (outcome in ('successful', 'failed')),
  category text,
  summary text,
  duration_seconds integer not null default 0,
  ended_reason text,
  transcript jsonb not null default '[]'::jsonb,
  call_goals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table conversations enable row level security;

create policy "Members can view their organization's conversations"
  on conversations for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create conversations in their organization"
  on conversations for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's conversations"
  on conversations for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's conversations"
  on conversations for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create table caller_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  caller_name text,
  caller_phone text,
  summary text,
  quoted_line text,
  is_read boolean not null default false,
  converted_to_client_id uuid references clients(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table caller_messages enable row level security;

create policy "Members can view their organization's caller messages"
  on caller_messages for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create caller messages in their organization"
  on caller_messages for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's caller messages"
  on caller_messages for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's caller messages"
  on caller_messages for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
