import { createClient } from '@/lib/supabase/server'

export type OrganizationSettings = {
  id: string | null
  organizationId: string
  notifyPostCallSummary: boolean
  notifyAppointmentReminders: boolean
  notifyClientBookings: boolean
  notifyStaffBookings: boolean
  featureServices: boolean
  featureStaff: boolean
  featureAssets: boolean
  featureProducts: boolean
  featureAvailability: boolean
  featureCustomTimezones: boolean
  featureBookingPage: boolean
  featureMessages: boolean
  featureFaq: boolean
  featureAppointments: boolean
  featureHomeMobile: boolean
  featureGroupSessions: boolean
  featureRentals: boolean
  featureGuides: boolean
}

function defaultOrganizationSettings(organizationId: string): OrganizationSettings {
  return {
    id: null,
    organizationId,
    notifyPostCallSummary: true,
    notifyAppointmentReminders: true,
    notifyClientBookings: true,
    notifyStaffBookings: true,
    featureServices: true,
    featureStaff: true,
    featureAssets: true,
    featureProducts: true,
    featureAvailability: true,
    featureCustomTimezones: false,
    featureBookingPage: true,
    featureMessages: true,
    featureFaq: true,
    featureAppointments: true,
    featureHomeMobile: true,
    featureGroupSessions: true,
    featureRentals: true,
    featureGuides: true,
  }
}

export async function getOrganizationSettings(
  organizationId: string
): Promise<OrganizationSettings> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organization_settings')
    .select(
      'id, organization_id, notify_post_call_summary, notify_appointment_reminders, notify_client_bookings, notify_staff_bookings, feature_services, feature_staff, feature_assets, feature_products, feature_availability, feature_custom_timezones, feature_booking_page, feature_messages, feature_faq, feature_appointments, feature_home_mobile, feature_group_sessions, feature_rentals, feature_guides'
    )
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!data) return defaultOrganizationSettings(organizationId)

  return {
    id: data.id,
    organizationId: data.organization_id,
    notifyPostCallSummary: data.notify_post_call_summary,
    notifyAppointmentReminders: data.notify_appointment_reminders,
    notifyClientBookings: data.notify_client_bookings,
    notifyStaffBookings: data.notify_staff_bookings,
    featureServices: data.feature_services,
    featureStaff: data.feature_staff,
    featureAssets: data.feature_assets,
    featureProducts: data.feature_products,
    featureAvailability: data.feature_availability,
    featureCustomTimezones: data.feature_custom_timezones,
    featureBookingPage: data.feature_booking_page,
    featureMessages: data.feature_messages,
    featureFaq: data.feature_faq,
    featureAppointments: data.feature_appointments,
    featureHomeMobile: data.feature_home_mobile,
    featureGroupSessions: data.feature_group_sessions,
    featureRentals: data.feature_rentals,
    featureGuides: data.feature_guides,
  }
}
