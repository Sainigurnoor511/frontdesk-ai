import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getServices, getBusinessProfile } from '@/lib/data/business'
import { getBookingPageConfig } from '@/lib/data/booking-page-config'
import { createClient } from '@/lib/supabase/server'
import { BookingPageClient } from './booking-page-client'

export default async function BookingPagePage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const [settings, services, businessProfile, config, { data: orgRow }] = await Promise.all([
    getOrganizationSettings(context.org.id),
    getServices(context.org.id),
    getBusinessProfile(context.org.id),
    getBookingPageConfig(context.org.id),
    supabase.from('organizations').select('slug').eq('id', context.org.id).maybeSingle(),
  ])

  return (
    <BookingPageClient
      organizationId={context.org.id}
      organizationName={context.org.name}
      organizationSlug={orgRow?.slug ?? context.org.id}
      settings={settings}
      services={services}
      businessProfile={businessProfile}
      config={config}
    />
  )
}
