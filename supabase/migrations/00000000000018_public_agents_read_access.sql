create policy "Public can view agents for booking-page-enabled organizations"
  on agents for select
  using (
    organization_id in (
      select organization_id from organization_settings where booking_page_enabled = true
    )
  );
