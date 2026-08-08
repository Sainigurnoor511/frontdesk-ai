alter table appointments
  add column if not exists google_calendar_event_id text;

create index if not exists appointments_google_calendar_event_id_idx
  on appointments (organization_id, google_calendar_event_id)
  where google_calendar_event_id is not null;
