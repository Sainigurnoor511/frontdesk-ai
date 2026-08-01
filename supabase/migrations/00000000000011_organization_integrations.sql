create table organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  integration_slug text not null,
  is_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, integration_slug)
);

alter table organization_integrations enable row level security;

create policy "Members can view their organization's integrations"
  on organization_integrations for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create integrations in their organization"
  on organization_integrations for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's integrations"
  on organization_integrations for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's integrations"
  on organization_integrations for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
