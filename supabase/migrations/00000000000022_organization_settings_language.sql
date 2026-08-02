alter table organization_settings
  add column if not exists language text not null default 'en';
