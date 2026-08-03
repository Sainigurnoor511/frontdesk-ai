-- Link appointments and clients to the conversation that produced them during
-- a voice call. All columns are nullable: existing rows and dashboard-created
-- appointments that don't set them stay null, and the future conversations-list
-- UI can render appointment accordion rows and "New client" badges directly off
-- these FKs instead of timestamp heuristics.

alter table appointments
  add column if not exists client_id uuid references clients(id);

alter table appointments
  add column if not exists conversation_id uuid references conversations(id);

alter table clients
  add column if not exists conversation_id uuid references conversations(id);

-- The voice worker writes appointments/clients via the service-role client
-- (which bypasses RLS anyway); these policies make that path explicit and
-- mirror the existing service-role policy on `conversations` (migration 19).
create policy "Service role can manage all appointments"
  on appointments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role can manage all clients"
  on clients for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
