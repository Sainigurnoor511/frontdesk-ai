import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getTotpFactorStatus } from './actions'
import { SettingsClient } from './settings-client'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mfa?: string }>
}) {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const [settings, totpStatus] = await Promise.all([
    getOrganizationSettings(context.org.id),
    getTotpFactorStatus(),
  ])
  // `mfa=recovered` is set by `redeemRecoveryCode`. Unsigned and harmless: it only shows a prompt
  // to set two-factor up again, which the page shows only while two-factor is actually off.
  const { tab, mfa } = await searchParams

  return (
    <SettingsClient
      email={context.user.email}
      orgName={context.org.name}
      avatarUrl={context.user.avatarUrl}
      settings={settings}
      initialTab={tab}
      initialTotpEnabled={totpStatus.enabled}
      initialTotpFactorId={totpStatus.factorId}
      initialRecoveryCodesRemaining={totpStatus.recoveryCodesRemaining}
      mfaRecovered={mfa === 'recovered'}
    />
  )
}

// Composed by the root layout's title template into "Settings · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Settings' }
