'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Envelope,
  ShieldCheck,
  Translate,
  SignOut,
  FileText,
  BellRinging,
  UsersThree,
  UserGear,
} from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { logOut } from '@/app/(auth)/actions'
import type { OrganizationSettings } from '@/lib/data/settings'
import { updateNotificationSettings, updateFeatureSettings } from './actions'

type Tab = 'account' | 'notifications' | 'features'

const NAV_ITEMS: { value: Tab; label: string }[] = [
  { value: 'account', label: 'Account' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'features', label: 'Features' },
]

export function SettingsClient({
  email,
  settings,
  initialTab,
}: {
  email: string
  settings: OrganizationSettings
  initialTab?: string
}) {
  const activeTab: Tab = NAV_ITEMS.some((item) => item.value === initialTab)
    ? (initialTab as Tab)
    : 'account'

  return (
    <div className="flex gap-8">
      <aside className="w-48 shrink-0 space-y-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to app
        </Link>

        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.value}
              href={`/settings?tab=${item.value}`}
              className={`block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === item.value
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm font-normal text-[#96989d]">Manage your account, notifications, and modules.</p>
        </div>

        {activeTab === 'account' && <AccountTab email={email} />}
        {activeTab === 'notifications' && <NotificationsTab settings={settings} />}
        {activeTab === 'features' && <FeaturesTab settings={settings} />}
      </div>
    </div>
  )
}

// ---------------- Account Tab ----------------

function AccountTab({ email }: { email: string }) {
  const [language, setLanguage] = useState('en')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSignOutAllDevices() {
    startTransition(async () => {
      // TODO: this only signs out the current session. A true "invalidate all
      // sessions" feature needs Supabase session management (listing and
      // revoking every refresh token for the user) that doesn't exist yet.
      await logOut()
      router.push('/login')
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Envelope className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Email & Password</h3>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          <div>
            {/* TODO: Supabase password reset flow is a separate feature - not wired up in this pass. */}
            <Button type="button" variant="outline" size="sm">
              Change Password
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Two-Factor Authentication</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Disabled</Badge>
          </div>
          <div>
            {/* TODO: real 2FA setup (enrollment, verification codes) is out of scope for this pass. */}
            <Button type="button" variant="outline" size="sm">
              Enable 2FA
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Translate className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Application language</h3>
          </div>
          <div className="max-w-xs space-y-1.5">
            <Select value={language} onValueChange={(v) => setLanguage(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <SignOut className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Sign Out All Devices</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            This will sign you out of your current session. Full multi-device session
            invalidation is not yet supported.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOutAllDevices}
              disabled={isPending}
            >
              {isPending ? 'Signing out…' : 'Sign Out All Devices'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------- Notifications Tab ----------------

type NotificationKey =
  | 'notifyPostCallSummary'
  | 'notifyAppointmentReminders'
  | 'notifyClientBookings'
  | 'notifyStaffBookings'

const NOTIFICATION_ROWS: {
  key: NotificationKey
  icon: typeof FileText
  title: string
  description: string
}[] = [
  {
    key: 'notifyPostCallSummary',
    icon: FileText,
    title: 'Post-call summary',
    description: 'Email',
  },
  {
    key: 'notifyAppointmentReminders',
    icon: BellRinging,
    title: 'Appointment reminders',
    description: 'Email · 24h before · Reminder',
  },
  {
    key: 'notifyClientBookings',
    icon: UsersThree,
    title: 'Clients booking notifications',
    description: 'Email',
  },
  {
    key: 'notifyStaffBookings',
    icon: UserGear,
    title: 'Staff booking notifications',
    description: 'Email',
  },
]

function NotificationsTab({ settings }: { settings: OrganizationSettings }) {
  const [subTab, setSubTab] = useState<'general' | 'email'>('general')
  const [values, setValues] = useState({
    notifyPostCallSummary: settings.notifyPostCallSummary,
    notifyAppointmentReminders: settings.notifyAppointmentReminders,
    notifyClientBookings: settings.notifyClientBookings,
    notifyStaffBookings: settings.notifyStaffBookings,
  })
  const [, startTransition] = useTransition()

  function handleToggle(key: NotificationKey, checked: boolean) {
    setValues((prev) => ({ ...prev, [key]: checked }))
    startTransition(async () => {
      const result = await updateNotificationSettings({ [key]: checked })
      if ('error' in result) {
        toast.error(result.error)
        setValues((prev) => ({ ...prev, [key]: !checked }))
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-[3px]">
        <button
          type="button"
          onClick={() => setSubTab('general')}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            subTab === 'general' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          General
        </button>
        <button
          type="button"
          onClick={() => setSubTab('email')}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            subTab === 'email' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Email
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {NOTIFICATION_ROWS.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <row.icon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="text-sm text-muted-foreground">{row.description}</p>
                  </div>
                </div>
                <Switch
                  checked={values[row.key]}
                  onCheckedChange={(checked) => handleToggle(row.key, checked)}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------- Features Tab ----------------

type FeatureKey =
  | 'featureServices'
  | 'featureStaff'
  | 'featureAssets'
  | 'featureProducts'
  | 'featureAvailability'
  | 'featureCustomTimezones'
  | 'featureBookingPage'
  | 'featureMessages'
  | 'featureFaq'
  | 'featureAppointments'
  | 'featureHomeMobile'
  | 'featureGroupSessions'
  | 'featureRentals'
  | 'featureGuides'

type ModuleRow =
  | { key: FeatureKey; title: string; description: string; forcedOn?: false }
  | { key: null; title: string; description: string; forcedOn: true }

const MODULE_ROWS: ModuleRow[] = [
  { key: 'featureServices', title: 'Services', description: 'Bookable appointments tied to staff and services' },
  { key: 'featureStaff', title: 'Staff', description: 'Team members and their schedules' },
  { key: 'featureAssets', title: 'Assets', description: 'Rooms, equipment, and resources' },
  { key: 'featureProducts', title: 'Products', description: 'Non-bookable items you sell or showcase' },
  {
    key: null,
    title: 'Clients',
    description: 'Required by Services',
    forcedOn: true,
  },
  {
    key: 'featureAvailability',
    title: 'Availability',
    description: 'Working hours, holidays, and time-off management',
  },
  {
    key: 'featureCustomTimezones',
    title: 'Custom timezones per resource',
    description:
      'Adds a timezone picker to location, staff, asset, and human-first hours. Off by default.',
  },
  {
    key: 'featureBookingPage',
    title: 'Online booking page',
    description: 'Public page where customers can book appointments',
  },
  { key: 'featureMessages', title: 'Messages', description: 'Voicemails and callback requests left by callers' },
  { key: 'featureFaq', title: 'FAQ', description: "Questions your AI couldn't answer, ready for you to review" },
]

const BOOKING_ROWS: { key: FeatureKey; title: string; description: string }[] = [
  { key: 'featureAppointments', title: 'Appointments', description: 'One-on-one services delivered by staff' },
  {
    key: 'featureHomeMobile',
    title: 'Home & mobile services',
    description: "Staff travels to the customer's location (adds travel time)",
  },
  {
    key: 'featureGroupSessions',
    title: 'Group sessions',
    description: 'Classes, workshops, and multi-participant sessions',
  },
  {
    key: 'featureRentals',
    title: 'Rentals',
    description: 'Asset-based reservations (rooms, courts, equipment)',
  },
]

function FeaturesTab({ settings }: { settings: OrganizationSettings }) {
  const [values, setValues] = useState<Record<FeatureKey, boolean>>({
    featureServices: settings.featureServices,
    featureStaff: settings.featureStaff,
    featureAssets: settings.featureAssets,
    featureProducts: settings.featureProducts,
    featureAvailability: settings.featureAvailability,
    featureCustomTimezones: settings.featureCustomTimezones,
    featureBookingPage: settings.featureBookingPage,
    featureMessages: settings.featureMessages,
    featureFaq: settings.featureFaq,
    featureAppointments: settings.featureAppointments,
    featureHomeMobile: settings.featureHomeMobile,
    featureGroupSessions: settings.featureGroupSessions,
    featureRentals: settings.featureRentals,
    featureGuides: settings.featureGuides,
  })
  const [, startTransition] = useTransition()

  function handleToggle(key: FeatureKey, checked: boolean) {
    setValues((prev) => ({ ...prev, [key]: checked }))
    startTransition(async () => {
      const result = await updateFeatureSettings({ [key]: checked })
      if ('error' in result) {
        toast.error(result.error)
        setValues((prev) => ({ ...prev, [key]: !checked }))
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Modules</h3>
          <p className="text-sm text-muted-foreground">
            Enable or disable top-level modules for your workspace.
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {MODULE_ROWS.map((row) => (
                <li key={row.key ?? row.title} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="text-sm text-muted-foreground">{row.description}</p>
                  </div>
                  <Switch
                    checked={row.forcedOn ? true : values[row.key]}
                    disabled={row.forcedOn}
                    onCheckedChange={
                      row.forcedOn ? undefined : (checked) => handleToggle(row.key, checked)
                    }
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Appointments & booking</h3>
          <p className="text-sm text-muted-foreground">
            Choose which types of bookable services your business needs.
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {BOOKING_ROWS.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="text-sm text-muted-foreground">{row.description}</p>
                  </div>
                  <Switch
                    checked={values[row.key]}
                    onCheckedChange={(checked) => handleToggle(row.key, checked)}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Guides</h3>
        </div>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              <li className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">Guides</p>
                  <p className="text-sm text-muted-foreground">
                    Step-by-step tutorials and links to set up your receptionist
                  </p>
                </div>
                {/* TODO: the sidebar (components/layout/app-sidebar.tsx) does not yet read
                    this flag to conditionally hide its "Guides" nav item. Wiring that up is a
                    cross-cutting change (sidebar needs org settings) left as a follow-up. */}
                <Switch
                  checked={values.featureGuides}
                  onCheckedChange={(checked) => handleToggle('featureGuides', checked)}
                />
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
