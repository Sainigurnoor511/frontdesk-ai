import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getOrganizationSettings } from '@/lib/data/settings'
import { SettingsClient } from './settings-client'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const settings = await getOrganizationSettings(context.org.id)
  const { tab } = await searchParams

  return (
    <SettingsClient
      email={context.user.email}
      orgName={context.org.name}
      avatarUrl={context.user.avatarUrl}
      settings={settings}
      initialTab={tab}
    />
  )
}
