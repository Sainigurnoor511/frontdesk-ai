import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getTotpFactorStatus } from './actions'
import { SettingsClient } from './settings-client'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mfa?: string; sessions?: string }>
}) {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  const [settings, totpStatus] = await Promise.all([
    getOrganizationSettings(context.org.id),
    getTotpFactorStatus(),
  ])
  // `mfa=recovered` (and `sessions=active` when the other sessions could not be signed out) are set
  // by `redeemRecoveryCode`. Unsigned and harmless: they only change the wording of a prompt that
  // the page shows only while two-factor is actually off.
  const { tab, mfa, sessions } = await searchParams

  return (
    <SettingsClient
      email={context.user.email}
      orgName={context.org.name}
      avatarUrl={context.user.avatarUrl}
      settings={settings}
      initialTab={tab}
      initialTotpEnabled={totpStatus.enabled}
      initialTotpFactorId={totpStatus.factorId}
      initialRecoveryCodes={totpStatus.recoveryCodes}
      mfaRecovered={mfa === 'recovered'}
      otherSessionsActive={sessions === 'active'}
    />
  )
}

// Composed by the root layout's title template into "Settings · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Settings' }
