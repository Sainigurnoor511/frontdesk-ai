create table appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  title text not null,
  client_name text not null,
  client_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  internal_notes text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  scope text not null default 'company' check (scope in ('company', 'staff', 'asset')),
  name text not null,
  all_day boolean not null default true,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table appointments enable row level security;
alter table time_off enable row level security;

create policy "Members can view their organization's appointments"
  on appointments for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create appointments in their organization"
  on appointments for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's appointments"
  on appointments for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's appointments"
  on appointments for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can view their organization's time off"
  on time_off for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create time off in their organization"
  on time_off for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's time off"
  on time_off for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's time off"
  on time_off for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
