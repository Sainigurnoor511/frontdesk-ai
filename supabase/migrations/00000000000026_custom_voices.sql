create table custom_voices (
  organization_id uuid not null references organizations(id) on delete cascade,
  voice_id text not null,
  name text not null,
  language text not null default 'en',
  created_at timestamptz not null default now(),
  primary key (organization_id, voice_id)
);

alter table custom_voices enable row level security;

create policy "Members can view their organization's custom voices"
  on custom_voices for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can add their organization's custom voices"
  on custom_voices for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can remove their organization's custom voices"
  on custom_voices for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
