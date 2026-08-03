alter table organization_settings add column if not exists booking_page_theme text not null default 'light';

alter table organization_settings add column if not exists booking_page_accent text not null default '#4F46E5';
