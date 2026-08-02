create table favorite_voices (
  organization_id uuid not null references organizations(id) on delete cascade,
  voice_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, voice_id)
);

alter table favorite_voices enable row level security;

create policy "Members can view their organization's favorite voices"
  on favorite_voices for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can add their organization's favorite voices"
  on favorite_voices for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can remove their organization's favorite voices"
  on favorite_voices for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
