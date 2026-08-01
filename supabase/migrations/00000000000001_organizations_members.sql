create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table organizations enable row level security;
alter table members enable row level security;

create policy "Members can view their organization"
  on organizations for select
  using (
    exists (
      select 1 from members
      where members.organization_id = organizations.id
      and members.user_id = auth.uid()
    )
  );

create policy "Owners can update their organization"
  on organizations for update
  using (
    exists (
      select 1 from members
      where members.organization_id = organizations.id
      and members.user_id = auth.uid()
      and members.role = 'owner'
    )
  );

create policy "Members can view their own membership rows"
  on members for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
