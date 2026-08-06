create extension if not exists vector with schema extensions;

-- Uploaded files and crawled websites indexed for RAG retrieval.
create table if not exists knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in ('file', 'website')),
  name text not null,
  source_url text,
  storage_path text,
  scan_depth text check (scan_depth in ('single', 'quick', 'deep')),
  status text not null default 'pending' check (status in ('pending', 'indexing', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_sources_org_idx on knowledge_sources (organization_id);

alter table knowledge_sources enable row level security;

drop policy if exists "Members can view their organization's knowledge sources" on knowledge_sources;
create policy "Members can view their organization's knowledge sources"
  on knowledge_sources for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Members can create knowledge sources for their organization" on knowledge_sources;
create policy "Members can create knowledge sources for their organization"
  on knowledge_sources for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Members can update their organization's knowledge sources" on knowledge_sources;
create policy "Members can update their organization's knowledge sources"
  on knowledge_sources for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Members can delete their organization's knowledge sources" on knowledge_sources;
create policy "Members can delete their organization's knowledge sources"
  on knowledge_sources for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

-- Manual FAQ entries (also indexed into knowledge_chunks).
create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faqs_org_idx on faqs (organization_id);

alter table faqs enable row level security;

drop policy if exists "Members can view their organization's faqs" on faqs;
create policy "Members can view their organization's faqs"
  on faqs for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Members can create faqs for their organization" on faqs;
create policy "Members can create faqs for their organization"
  on faqs for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Members can update their organization's faqs" on faqs;
create policy "Members can update their organization's faqs"
  on faqs for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Members can delete their organization's faqs" on faqs;
create policy "Members can delete their organization's faqs"
  on faqs for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

-- Chunked text + optional embeddings for vector similarity search.
create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source_type text not null check (source_type in ('knowledge_source', 'faq')),
  source_id uuid not null,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(384),
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_org_idx on knowledge_chunks (organization_id);
create index if not exists knowledge_chunks_source_idx on knowledge_chunks (source_type, source_id);
create index if not exists knowledge_chunks_content_fts_idx on knowledge_chunks
  using gin (to_tsvector('english', content));

alter table knowledge_chunks enable row level security;

drop policy if exists "Members can view their organization's knowledge chunks" on knowledge_chunks;
create policy "Members can view their organization's knowledge chunks"
  on knowledge_chunks for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

-- Vector similarity search scoped to one organization (service-role + RPC).
-- Use cosine_distance() — local Supabase CLI does not always register <=> for extensions.vector.
create or replace function match_knowledge_chunks(
  query_embedding extensions.vector(384),
  match_count int,
  p_organization_id uuid
)
returns table (
  id uuid,
  content text,
  source_type text,
  source_id uuid,
  similarity float
)
language sql stable
set search_path = public, extensions
as $$
  select
    kc.id,
    kc.content,
    kc.source_type,
    kc.source_id,
    1 - extensions.cosine_distance(kc.embedding, query_embedding) as similarity
  from knowledge_chunks kc
  where kc.organization_id = p_organization_id
    and kc.embedding is not null
  order by extensions.cosine_distance(kc.embedding, query_embedding)
  limit match_count;
$$;

-- Private bucket for uploaded knowledge documents (txt/md for v1).
insert into storage.buckets (id, name, public)
values ('knowledge-documents', 'knowledge-documents', false)
on conflict (id) do nothing;

drop policy if exists "Members can upload knowledge documents for their organization" on storage.objects;
create policy "Members can upload knowledge documents for their organization"
  on storage.objects for insert
  with check (
    bucket_id = 'knowledge-documents'
    and (storage.foldername(name))[1] in (
      select organization_id::text from members where user_id = auth.uid()
    )
  );

drop policy if exists "Members can view knowledge documents for their organization" on storage.objects;
create policy "Members can view knowledge documents for their organization"
  on storage.objects for select
  using (
    bucket_id = 'knowledge-documents'
    and (storage.foldername(name))[1] in (
      select organization_id::text from members where user_id = auth.uid()
    )
  );

drop policy if exists "Members can delete knowledge documents for their organization" on storage.objects;
create policy "Members can delete knowledge documents for their organization"
  on storage.objects for delete
  using (
    bucket_id = 'knowledge-documents'
    and (storage.foldername(name))[1] in (
      select organization_id::text from members where user_id = auth.uid()
    )
  );
