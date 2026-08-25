import { redirect } from 'next/navigation'
import { getStaffForOrg } from '@/lib/data/staff'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getStaffAvailabilityNow } from '@/lib/data/availability-engine'
import { StaffClient } from './staff-client'

export default async function StaffPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const [staff, availabilityNow] = await Promise.all([
    getStaffForOrg(),
    getStaffAvailabilityNow(context.org.id),
  ])

  return <StaffClient staff={staff} availabilityNow={availabilityNow} />
}
