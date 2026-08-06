alter table conversations add column if not exists is_read boolean not null default false;

-- Treat existing conversations as already reviewed so only new calls badge the sidebar.
update conversations set is_read = true where is_read = false;

create index if not exists conversations_org_unread_idx
  on conversations (organization_id, is_read)
  where is_read = false;
