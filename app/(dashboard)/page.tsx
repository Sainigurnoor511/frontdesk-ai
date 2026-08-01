import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { HomeClient } from './home-client'

export default async function HomePage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  return <HomeClient />
}
