create table booking_page_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,

  -- Typography
  heading_font text not null default 'system-ui',
  body_font text not null default 'system-ui',
  heading_size text not null default 'lg' check (heading_size in ('sm', 'md', 'lg', 'xl')),
  body_size text not null default 'md' check (body_size in ('sm', 'md', 'lg')),
  font_weight text not null default 'normal' check (font_weight in ('normal', 'medium', 'semibold', 'bold')),
  line_height text not null default 'normal' check (line_height in ('tight', 'normal', 'relaxed')),
  letter_spacing text not null default 'normal' check (letter_spacing in ('tight', 'normal', 'wide')),

  -- Branding
  logo_url text,
  tagline text,
  business_description text,

  -- Layout
  receptionist_position text not null default 'left' check (receptionist_position in ('left', 'right')),
  show_header boolean not null default true,
  show_service_descriptions boolean not null default true,
  show_prices boolean not null default true,

  -- Media
  background_image_url text,
  background_video_url text,

  -- Forms: array of { id, label, type, required, options? }
  custom_fields jsonb not null default '[]'::jsonb,

  -- Checklist / confirmation rules
  require_email_verification boolean not null default false,
  auto_confirm_bookings boolean not null default true,
  cancellation_policy_text text,
  cancellation_notice_hours integer not null default 24,

  -- Voice widget behavior (Global section)
  auto_greet_on_load boolean not null default false,
  show_phone_fallback boolean not null default true,
  call_widget_position text not null default 'center' check (call_widget_position in ('bottom-left', 'bottom-right', 'center')),

  -- Booking flow (Global section)
  show_staff_selection boolean not null default true,
  show_receptionist_on_booking_page boolean not null default true,
  receptionist_only boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table booking_page_config enable row level security;

create policy "Members can view their organization's booking page config"
  on booking_page_config for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create their organization's booking page config"
  on booking_page_config for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's booking page config"
  on booking_page_config for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's booking page config"
  on booking_page_config for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

-- Public read: the public booking page renders these fields with no auth.
create policy "Public can view booking page config for enabled pages"
  on booking_page_config for select
  using (
    organization_id in (
      select organization_id from organization_settings where booking_page_enabled = true
    )
  );

create table booking_page_config_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table booking_page_config_versions enable row level security;

create policy "Members can view their organization's booking page config versions"
  on booking_page_config_versions for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create booking page config versions in their organization"
  on booking_page_config_versions for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's booking page config versions"
  on booking_page_config_versions for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values ('booking-page-media', 'booking-page-media', true)
on conflict (id) do nothing;

create policy "Public can view booking page media"
  on storage.objects for select
  using (bucket_id = 'booking-page-media');

create policy "Members can upload booking page media for their organization"
  on storage.objects for insert
  with check (
    bucket_id = 'booking-page-media'
    and (storage.foldername(name))[1] in (
      select organization_id::text from members where user_id = auth.uid()
    )
  );

create policy "Members can update booking page media for their organization"
  on storage.objects for update
  using (
    bucket_id = 'booking-page-media'
    and (storage.foldername(name))[1] in (
      select organization_id::text from members where user_id = auth.uid()
    )
  );

create policy "Members can delete booking page media for their organization"
  on storage.objects for delete
  using (
    bucket_id = 'booking-page-media'
    and (storage.foldername(name))[1] in (
      select organization_id::text from members where user_id = auth.uid()
    )
  );
