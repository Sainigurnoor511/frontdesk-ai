import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getTotpFactorStatus } from './actions'
import { SettingsClient } from './settings-client'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const [settings, totpStatus] = await Promise.all([
    getOrganizationSettings(context.org.id),
    getTotpFactorStatus(),
  ])
  const { tab } = await searchParams

  return (
    <SettingsClient
      email={context.user.email}
      orgName={context.org.name}
      avatarUrl={context.user.avatarUrl}
      settings={settings}
      initialTab={tab}
      initialTotpEnabled={totpStatus.enabled}
      initialTotpFactorId={totpStatus.factorId}
    />
  )
}

// Composed by the root layout's title template into "Settings · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Settings' }
