create table staff_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_members(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_open boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, day_of_week)
);

alter table staff_hours enable row level security;

create policy "Members can view their organization's staff hours"
  on staff_hours for select
  using (
    staff_id in (
      select id from staff_members where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
  );

create policy "Members can create staff hours in their organization"
  on staff_hours for insert
  with check (
    staff_id in (
      select id from staff_members where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
  );

create policy "Members can update their organization's staff hours"
  on staff_hours for update
  using (
    staff_id in (
      select id from staff_members where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
  );

create policy "Members can delete their organization's staff hours"
  on staff_hours for delete
  using (
    staff_id in (
      select id from staff_members where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
  );

alter table time_off add column if not exists staff_id uuid references staff_members(id) on delete cascade;

alter table appointments add column if not exists service_id uuid references services(id) on delete set null;
alter table appointments add column if not exists staff_id uuid references staff_members(id) on delete set null;
