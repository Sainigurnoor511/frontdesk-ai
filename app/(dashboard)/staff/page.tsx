import { getStaffForOrg } from '@/lib/data/staff'
import { StaffClient } from './staff-client'

export default async function StaffPage() {
  const staff = await getStaffForOrg()

  return <StaffClient staff={staff} />
}
