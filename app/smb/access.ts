import { getOrganizationSettings } from '@/lib/data/settings'
import { getCurrentOrgAndUser } from '@/lib/data/organization'

export async function isOrganizationMember(organizationId: string): Promise<boolean> {
  const context = await getCurrentOrgAndUser()
  return context?.org.id === organizationId
}

export async function canUseBookingPage(organizationId: string): Promise<boolean> {
  const settings = await getOrganizationSettings(organizationId)
  if (settings.id && settings.bookingPageEnabled) return true
  return isOrganizationMember(organizationId)
}

export const BOOKING_PAGE_UNAVAILABLE = 'Online booking is not available for this business.'
