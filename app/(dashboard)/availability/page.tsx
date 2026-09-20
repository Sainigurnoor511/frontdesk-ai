import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getBusinessHours, getUpcomingExceptions } from '@/lib/data/availability'
import { getStaffForOrg } from '@/lib/data/staff'
import { getAssets } from '@/lib/data/business'
import { AvailabilityClient } from './availability-client'

export default async function AvailabilityPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const [businessHours, exceptions, staff, assets] = await Promise.all([
    getBusinessHours(context.org.id),
    getUpcomingExceptions(context.org.id),
    getStaffForOrg(),
    getAssets(context.org.id),
  ])

  return (
    <AvailabilityClient
      businessHours={businessHours}
      exceptions={exceptions}
      staff={staff}
      assets={assets}
    />
  )
}

// Composed by the root layout's title template into "Availability · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Availability' }
