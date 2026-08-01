alter table services add column if not exists show_on_booking_page boolean not null default true;

alter table organization_settings add column if not exists booking_page_enabled boolean not null default true;
