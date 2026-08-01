alter table agents add column if not exists additional_instructions text;
alter table agents add column if not exists first_message text;
alter table agents add column if not exists tone_traits text[] not null default '{}';
alter table agents add column if not exists voice_id text;
