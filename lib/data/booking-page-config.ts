import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type CustomField = {
  id: string
  label: string
  type: 'text' | 'dropdown' | 'checkbox'
  required: boolean
  options?: string[]
}

export type BookingPageConfig = {
  id: string | null
  organizationId: string
  headingFont: string
  bodyFont: string
  headingSize: 'sm' | 'md' | 'lg' | 'xl'
  bodySize: 'sm' | 'md' | 'lg'
  fontWeight: 'normal' | 'medium' | 'semibold' | 'bold'
  lineHeight: 'tight' | 'normal' | 'relaxed'
  letterSpacing: 'tight' | 'normal' | 'wide'
  logoUrl: string | null
  tagline: string | null
  businessDescription: string | null
  receptionistPosition: 'left' | 'right'
  showHeader: boolean
  showServiceDescriptions: boolean
  showPrices: boolean
  backgroundImageUrl: string | null
  backgroundVideoUrl: string | null
  customFields: CustomField[]
  requireEmailVerification: boolean
  autoConfirmBookings: boolean
  cancellationPolicyText: string | null
  cancellationNoticeHours: number
  autoGreetOnLoad: boolean
  showPhoneFallback: boolean
  callWidgetPosition: 'bottom-left' | 'bottom-right' | 'center'
  showStaffSelection: boolean
  showReceptionistOnBookingPage: boolean
  receptionistOnly: boolean
}

const SELECT_COLUMNS =
  'id, organization_id, heading_font, body_font, heading_size, body_size, font_weight, line_height, letter_spacing, logo_url, tagline, business_description, receptionist_position, show_header, show_service_descriptions, show_prices, background_image_url, background_video_url, custom_fields, require_email_verification, auto_confirm_bookings, cancellation_policy_text, cancellation_notice_hours, auto_greet_on_load, show_phone_fallback, call_widget_position, show_staff_selection, show_receptionist_on_booking_page, receptionist_only'

function defaultBookingPageConfig(organizationId: string): BookingPageConfig {
  return {
    id: null,
    organizationId,
    headingFont: 'system-ui',
    bodyFont: 'system-ui',
    headingSize: 'lg',
    bodySize: 'md',
    fontWeight: 'normal',
    lineHeight: 'normal',
    letterSpacing: 'normal',
    logoUrl: null,
    tagline: null,
    businessDescription: null,
    receptionistPosition: 'left',
    showHeader: true,
    showServiceDescriptions: true,
    showPrices: true,
    backgroundImageUrl: null,
    backgroundVideoUrl: null,
    customFields: [],
    requireEmailVerification: false,
    autoConfirmBookings: true,
    cancellationPolicyText: null,
    cancellationNoticeHours: 24,
    autoGreetOnLoad: false,
    showPhoneFallback: true,
    callWidgetPosition: 'center',
    showStaffSelection: true,
    showReceptionistOnBookingPage: true,
    receptionistOnly: false,
  }
}

type ConfigRow = {
  id: string
  organization_id: string
  heading_font: string
  body_font: string
  heading_size: BookingPageConfig['headingSize']
  body_size: BookingPageConfig['bodySize']
  font_weight: BookingPageConfig['fontWeight']
  line_height: BookingPageConfig['lineHeight']
  letter_spacing: BookingPageConfig['letterSpacing']
  logo_url: string | null
  tagline: string | null
  business_description: string | null
  receptionist_position: BookingPageConfig['receptionistPosition']
  show_header: boolean
  show_service_descriptions: boolean
  show_prices: boolean
  background_image_url: string | null
  background_video_url: string | null
  custom_fields: CustomField[]
  require_email_verification: boolean
  auto_confirm_bookings: boolean
  cancellation_policy_text: string | null
  cancellation_notice_hours: number
  auto_greet_on_load: boolean
  show_phone_fallback: boolean
  call_widget_position: BookingPageConfig['callWidgetPosition']
  show_staff_selection: boolean
  show_receptionist_on_booking_page: boolean
  receptionist_only: boolean
}

function mapRow(row: ConfigRow): BookingPageConfig {
  return {
    id: row.id,
    organizationId: row.organization_id,
    headingFont: row.heading_font,
    bodyFont: row.body_font,
    headingSize: row.heading_size,
    bodySize: row.body_size,
    fontWeight: row.font_weight,
    lineHeight: row.line_height,
    letterSpacing: row.letter_spacing,
    logoUrl: row.logo_url,
    tagline: row.tagline,
    businessDescription: row.business_description,
    receptionistPosition: row.receptionist_position,
    showHeader: row.show_header,
    showServiceDescriptions: row.show_service_descriptions,
    showPrices: row.show_prices,
    backgroundImageUrl: row.background_image_url,
    backgroundVideoUrl: row.background_video_url,
    customFields: row.custom_fields ?? [],
    requireEmailVerification: row.require_email_verification,
    autoConfirmBookings: row.auto_confirm_bookings,
    cancellationPolicyText: row.cancellation_policy_text,
    cancellationNoticeHours: row.cancellation_notice_hours,
    autoGreetOnLoad: row.auto_greet_on_load,
    showPhoneFallback: row.show_phone_fallback,
    callWidgetPosition: row.call_widget_position,
    showStaffSelection: row.show_staff_selection,
    showReceptionistOnBookingPage: row.show_receptionist_on_booking_page,
    receptionistOnly: row.receptionist_only,
  }
}

export async function getBookingPageConfig(organizationId: string): Promise<BookingPageConfig> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('booking_page_config')
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!data) return defaultBookingPageConfig(organizationId)
  return mapRow(data as ConfigRow)
}

export async function getPublicBookingPageConfig(organizationId: string): Promise<BookingPageConfig> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('booking_page_config')
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!data) return defaultBookingPageConfig(organizationId)
  return mapRow(data as ConfigRow)
}
