create table business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_open boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, day_of_week)
);

create table availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  type text not null default 'closed' check (type in ('closed', 'custom_hours')),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now()
);

alter table business_hours enable row level security;
alter table availability_exceptions enable row level security;

create policy "Members can view their organization's business hours"
  on business_hours for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create business hours in their organization"
  on business_hours for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's business hours"
  on business_hours for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's business hours"
  on business_hours for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can view their organization's availability exceptions"
  on availability_exceptions for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create availability exceptions in their organization"
  on availability_exceptions for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's availability exceptions"
  on availability_exceptions for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's availability exceptions"
  on availability_exceptions for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
