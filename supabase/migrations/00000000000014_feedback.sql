create table feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  issue text,
  feature_request text,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

create policy "Members can create feedback for their organization"
  on feedback for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
