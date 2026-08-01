create table staff_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  display_name text,
  description text,
  email text,
  phone text,
  is_active boolean not null default true,
  show_on_booking_page boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table staff_members enable row level security;

create policy "Members can view their organization's staff"
  on staff_members for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create staff in their organization"
  on staff_members for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's staff"
  on staff_members for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's staff"
  on staff_members for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
