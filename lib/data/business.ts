import { createClient } from '@/lib/supabase/server'

export type BusinessProfile = {
  id: string | null
  organizationId: string
  businessName: string | null
  country: string | null
  timezone: string
  currency: string
  bookingSlotIntervalMinutes: number
  advanceBookingWindowDays: number
  minimumBookingNoticeMinutes: number
  limitOverlappingAppointments: boolean
}

export type BusinessLocation = {
  id: string
  name: string
  address: string | null
  isActive: boolean
}

export type Service = {
  id: string
  name: string
  description: string | null
  durationMinutes: number
  price: number
  serviceType: 'appointment' | 'home_mobile' | 'group_session' | 'rental'
}

export type BusinessAsset = {
  id: string
  name: string
  description: string | null
  isActive: boolean
}

export type BusinessProduct = {
  id: string
  name: string
  description: string | null
  price: number
}

function defaultBusinessProfile(organizationId: string): BusinessProfile {
  return {
    id: null,
    organizationId,
    businessName: null,
    country: null,
    timezone: 'UTC',
    currency: 'USD',
    bookingSlotIntervalMinutes: 30,
    advanceBookingWindowDays: 14,
    minimumBookingNoticeMinutes: 0,
    limitOverlappingAppointments: false,
  }
}

export async function getBusinessProfile(organizationId: string): Promise<BusinessProfile> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('business_profile')
    .select(
      'id, organization_id, business_name, country, timezone, currency, booking_slot_interval_minutes, advance_booking_window_days, minimum_booking_notice_minutes, limit_overlapping_appointments'
    )
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!data) return defaultBusinessProfile(organizationId)

  return {
    id: data.id,
    organizationId: data.organization_id,
    businessName: data.business_name,
    country: data.country,
    timezone: data.timezone,
    currency: data.currency,
    bookingSlotIntervalMinutes: data.booking_slot_interval_minutes,
    advanceBookingWindowDays: data.advance_booking_window_days,
    minimumBookingNoticeMinutes: data.minimum_booking_notice_minutes,
    limitOverlappingAppointments: data.limit_overlapping_appointments,
  }
}

export async function getLocations(organizationId: string): Promise<BusinessLocation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('business_locations')
    .select('id, name, address, is_active')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((location) => ({
    id: location.id,
    name: location.name,
    address: location.address,
    isActive: location.is_active,
  }))
}

export async function getServices(organizationId: string): Promise<Service[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('services')
    .select('id, name, description, duration_minutes, price, service_type')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    durationMinutes: service.duration_minutes,
    price: Number(service.price),
    serviceType: service.service_type,
  }))
}

export async function getAssets(organizationId: string): Promise<BusinessAsset[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('business_assets')
    .select('id, name, description, is_active')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((asset) => ({
    id: asset.id,
    name: asset.name,
    description: asset.description,
    isActive: asset.is_active,
  }))
}

export async function getProducts(organizationId: string): Promise<BusinessProduct[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('business_products')
    .select('id, name, description, price')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    price: Number(product.price),
  }))
}
