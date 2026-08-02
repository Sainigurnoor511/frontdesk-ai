create table member_sidebar_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  hidden_items text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

alter table member_sidebar_preferences enable row level security;

create policy "Users can view their own sidebar preferences"
  on member_sidebar_preferences for select
  using (user_id = auth.uid());

create policy "Users can create their own sidebar preferences"
  on member_sidebar_preferences for insert
  with check (user_id = auth.uid());

create policy "Users can update their own sidebar preferences"
  on member_sidebar_preferences for update
  using (user_id = auth.uid());
