create table business_profile (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  business_name text,
  country text,
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  booking_slot_interval_minutes integer not null default 30,
  advance_booking_window_days integer not null default 14,
  minimum_booking_notice_minutes integer not null default 0,
  limit_overlapping_appointments boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table business_profile enable row level security;

create policy "Members can view their organization's business profile"
  on business_profile for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create their organization's business profile"
  on business_profile for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's business profile"
  on business_profile for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's business profile"
  on business_profile for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create table business_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table business_locations enable row level security;

create policy "Members can view their organization's locations"
  on business_locations for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create locations in their organization"
  on business_locations for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's locations"
  on business_locations for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's locations"
  on business_locations for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create table services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null,
  price numeric(10,2) not null default 0,
  service_type text not null default 'appointment' check (service_type in ('appointment','home_mobile','group_session','rental')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table services enable row level security;

create policy "Members can view their organization's services"
  on services for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create services in their organization"
  on services for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's services"
  on services for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's services"
  on services for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create table business_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table business_assets enable row level security;

create policy "Members can view their organization's assets"
  on business_assets for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create assets in their organization"
  on business_assets for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's assets"
  on business_assets for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's assets"
  on business_assets for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create table business_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table business_products enable row level security;

create policy "Members can view their organization's products"
  on business_products for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create products in their organization"
  on business_products for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's products"
  on business_products for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's products"
  on business_products for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
