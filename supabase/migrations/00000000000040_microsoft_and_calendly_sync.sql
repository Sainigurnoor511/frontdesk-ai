alter table appointments
  add column if not exists microsoft_calendar_event_id text,
  add column if not exists calendly_scheduling_url text;

create index if not exists appointments_microsoft_calendar_event_id_idx
  on appointments (organization_id, microsoft_calendar_event_id)
  where microsoft_calendar_event_id is not null;
