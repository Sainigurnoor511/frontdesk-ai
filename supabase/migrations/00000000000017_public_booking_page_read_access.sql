create policy "Public can view booking-page-enabled organization settings"
  on organization_settings for select
  using (booking_page_enabled = true);

create policy "Public can view bookable services"
  on services for select
  using (show_on_booking_page = true);
