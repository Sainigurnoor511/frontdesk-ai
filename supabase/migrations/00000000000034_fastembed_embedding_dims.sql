-- FastEmbed BGE-small-en-v1.5 uses 384-dimensional vectors.
-- Safe if migration 33 already used vector(1536): drops and recreates the column (re-index sources).

alter table knowledge_chunks drop column if exists embedding;
alter table knowledge_chunks add column embedding extensions.vector(384);

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
