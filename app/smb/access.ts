import { getOrganizationSettings } from '@/lib/data/settings'
import { getCurrentOrgAndUser } from '@/lib/data/organization'

export async function isOrganizationMember(organizationId: string): Promise<boolean> {
  const context = await getCurrentOrgAndUser()
  return context?.org.id === organizationId
}

// A booking page is usable by the public only while it is enabled; its own members can always use it, which is what the editor preview relies on.
export async function canUseBookingPage(organizationId: string): Promise<boolean> {
  const settings = await getOrganizationSettings(organizationId)
  if (settings.id && settings.bookingPageEnabled) return true
  return isOrganizationMember(organizationId)
}

export const BOOKING_PAGE_UNAVAILABLE = 'Online booking is not available for this business.'
