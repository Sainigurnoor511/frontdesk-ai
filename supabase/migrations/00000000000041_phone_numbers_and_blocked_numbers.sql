create table phone_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  number text not null,
  provider text not null check (provider in ('twilio', 'plivo', 'sip-trunk')) default 'twilio',
  twilio_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);

alter table phone_numbers enable row level security;

create policy "Members can view their organization's phone numbers"
  on phone_numbers for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create phone numbers in their organization"
  on phone_numbers for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's phone numbers"
  on phone_numbers for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's phone numbers"
  on phone_numbers for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create table blocked_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  number text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, agent_id, number)
);

alter table blocked_phone_numbers enable row level security;

create policy "Members can view their organization's blocked phone numbers"
  on blocked_phone_numbers for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can block phone numbers in their organization"
  on blocked_phone_numbers for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can unblock phone numbers in their organization"
  on blocked_phone_numbers for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
