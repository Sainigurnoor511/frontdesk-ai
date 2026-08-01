import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getBusinessHours, getUpcomingExceptions } from '@/lib/data/availability'
import { AvailabilityClient } from './availability-client'

export default async function AvailabilityPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const [businessHours, exceptions] = await Promise.all([
    getBusinessHours(context.org.id),
    getUpcomingExceptions(context.org.id),
  ])

  return <AvailabilityClient businessHours={businessHours} exceptions={exceptions} />
}
