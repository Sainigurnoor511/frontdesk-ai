create table agent_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  trigger text not null,
  action text not null,
  is_enabled boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_rules_agent_id_idx on agent_rules (agent_id, position);

alter table agent_rules enable row level security;

create policy "Members can view their organization's agent rules"
  on agent_rules for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create agent rules in their organization"
  on agent_rules for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's agent rules"
  on agent_rules for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's agent rules"
  on agent_rules for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
