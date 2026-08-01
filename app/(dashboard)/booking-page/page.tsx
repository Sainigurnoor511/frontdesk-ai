import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getServices } from '@/lib/data/business'
import { BookingPageClient } from './booking-page-client'

export default async function BookingPagePage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const [settings, services] = await Promise.all([
    getOrganizationSettings(context.org.id),
    getServices(context.org.id),
  ])

  return (
    <BookingPageClient
      organizationId={context.org.id}
      organizationName={context.org.name}
      settings={settings}
      services={services}
    />
  )
}
