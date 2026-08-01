create table organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  notify_post_call_summary boolean not null default true,
  notify_appointment_reminders boolean not null default true,
  notify_client_bookings boolean not null default true,
  notify_staff_bookings boolean not null default true,
  feature_services boolean not null default true,
  feature_staff boolean not null default true,
  feature_assets boolean not null default true,
  feature_products boolean not null default true,
  feature_availability boolean not null default true,
  feature_custom_timezones boolean not null default false,
  feature_booking_page boolean not null default true,
  feature_messages boolean not null default true,
  feature_faq boolean not null default true,
  feature_appointments boolean not null default true,
  feature_home_mobile boolean not null default true,
  feature_group_sessions boolean not null default true,
  feature_rentals boolean not null default true,
  feature_guides boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table organization_settings enable row level security;

create policy "Members can view their organization's settings"
  on organization_settings for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create settings in their organization"
  on organization_settings for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's settings"
  on organization_settings for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's settings"
  on organization_settings for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
