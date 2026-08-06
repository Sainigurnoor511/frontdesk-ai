alter table conversations add column if not exists room_name text;
alter table conversations add column if not exists recording_path text;

insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

-- No end-user (anon/authenticated via PostgREST) access to this bucket —
-- every read goes through a server-generated signed URL using the service-role
-- client, and every write comes from LiveKit egress via S3-compatible credentials.
