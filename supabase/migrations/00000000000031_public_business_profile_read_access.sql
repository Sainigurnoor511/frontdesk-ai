-- The public booking page reads business_profile.timezone to show the
-- visitor the org's timezone (e.g. "GMT+5:30"). Mirrors the existing public
-- read policies on organization_settings/services (migration 17).
create policy "Public can view timezone for booking-page-enabled organizations"
  on business_profile for select
  using (
    organization_id in (
      select organization_id from organization_settings where booking_page_enabled = true
    )
  );
