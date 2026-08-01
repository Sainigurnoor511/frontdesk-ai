create table agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  business_name text,
  country text,
  language text,
  industry text,
  greeting_prompt text,
  personality_notes text,
  answering_mode text check (answering_mode in ('staff_first', 'agent_first')),
  staff_phone_number text,
  max_ring_seconds integer not null default 20,
  hold_music text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  url text not null,
  scan_depth text not null check (scan_depth in ('single', 'quick', 'deep')),
  status text not null check (status in ('pending', 'running', 'completed', 'failed')) default 'pending',
  extracted_data jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table agents enable row level security;
alter table agent_scan_jobs enable row level security;

create policy "Members can view their organization's agents"
  on agents for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create agents in their organization"
  on agents for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's agents"
  on agents for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can view scan jobs for their organization's agents"
  on agent_scan_jobs for select
  using (
    agent_id in (
      select id from agents where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
    or agent_id is null
  );
