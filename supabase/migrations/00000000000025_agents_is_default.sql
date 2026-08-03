alter table agents add column is_default boolean not null default false;

-- Backfill: mark the earliest-created agent per org as the default.
with first_agent as (
  select distinct on (organization_id) id
  from agents
  order by organization_id, created_at asc
)
update agents
set is_default = true
where id in (select id from first_agent);
