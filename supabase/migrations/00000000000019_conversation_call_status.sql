alter table conversations add column if not exists status text not null default 'completed'
  check (status in ('active', 'completed', 'failed'));

alter table conversations add column if not exists started_at timestamptz not null default now();

create policy "Service role can manage all conversations"
  on conversations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
