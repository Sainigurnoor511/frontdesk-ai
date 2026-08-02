'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  FileText,
  BellRing,
  Users,
  UserCog,
  User,
  CreditCard,
  Bell,
  Eye,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { logOut } from '@/app/(auth)/actions'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarProvider } from '@/components/ui/sidebar'
import type { OrganizationSettings } from '@/lib/data/settings'
import { updateNotificationSettings, updateFeatureSettings } from './actions'

type Tab = 'account' | 'billing' | 'notifications' | 'features'

const NAV_ITEMS: { value: Tab; label: string; icon: typeof User }[] = [
  { value: 'account', label: 'Account', icon: User },
  { value: 'billing', label: 'Billing', icon: CreditCard },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'features', label: 'Features', icon: Eye },
]

export function SettingsClient({
  email,
  orgName,
  avatarUrl,
  settings,
  initialTab,
}: {
  email: string
  orgName: string
  avatarUrl: string | null
  settings: OrganizationSettings
  initialTab?: string
}) {
  const activeTab: Tab = NAV_ITEMS.some((item) => item.value === initialTab)
    ? (initialTab as Tab)
    : 'account'

  return (
    <SidebarProvider>
      <div className="flex h-svh flex-col">
        <AppHeader email={email} orgName={orgName} avatarUrl={avatarUrl} />
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-64 shrink-0 flex-col gap-4 border-r bg-muted/20 p-4">
            <div className="flex h-8 items-center gap-0 px-2">
              <span className="text-base font-semibold">F</span>
              <span className="text-base font-semibold tracking-tight">rontdesk.ai</span>
            </div>

            <Link
              href="/"
              className="flex items-center gap-2.5 px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" />
              Back to app
            </Link>

            <nav className="space-y-0.5">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.value}
                  href={`/settings?tab=${item.value}`}
                  className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === item.value
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  }`}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto p-8">
            <div className="mx-auto max-w-3xl space-y-6">
              <h1 className="font-heading text-2xl font-semibold capitalize">{activeTab}</h1>

              {activeTab === 'account' && <AccountTab email={email} />}
              {activeTab === 'billing' && <BillingTab />}
              {activeTab === 'notifications' && <NotificationsTab settings={settings} />}
              {activeTab === 'features' && <FeaturesTab settings={settings} />}
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
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
    <div>
      <div className="flex items-start justify-between gap-6 border-b py-6 first:pt-0">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Email & Password</h3>
          <p className="text-sm text-muted-foreground">Manage your email address and password.</p>
        </div>
        <div className="shrink-0 space-y-3 text-right">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Email Address</p>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          {/* TODO: Supabase password reset flow is a separate feature - not wired up in this pass. */}
          <Button type="button" variant="outline" size="sm">
            Change Password
          </Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-6 border-b py-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Two-Factor Authentication</h3>
            <Badge variant="outline">Disabled</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Add an extra layer of security to your account using an authenticator app.
          </p>
        </div>
        {/* TODO: real 2FA setup (enrollment, verification codes) is out of scope for this pass. */}
        <Button type="button" variant="outline" size="sm" className="shrink-0">
          Enable 2FA
        </Button>
      </div>

      <div className="flex items-start justify-between gap-6 border-b py-6">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Application language</h3>
          <p className="text-sm text-muted-foreground">Choose the language for the application interface.</p>
        </div>
        <Select value={language} onValueChange={(v) => setLanguage(v ?? '')}>
          <SelectTrigger className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-start justify-between gap-6 py-6 last:border-0">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Sign Out All Devices</h3>
          <p className="text-sm text-muted-foreground">
            Sign out of all devices and sessions. You will need to sign in again.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={handleSignOutAllDevices}
          disabled={isPending}
        >
          {isPending ? 'Signing out…' : 'Sign Out All Devices'}
        </Button>
      </div>
    </div>
  )
}

// ---------------- Billing Tab ----------------

function BillingTab() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <CreditCard className="size-8 text-muted-foreground" />
        <p className="font-medium">Billing is coming soon</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Plan management and invoices will show up here once billing is wired up.
        </p>
      </CardContent>
    </Card>
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
    icon: BellRing,
    title: 'Appointment reminders',
    description: 'Email · 24h before · Reminder',
  },
  {
    key: 'notifyClientBookings',
    icon: Users,
    title: 'Clients booking notifications',
    description: 'Email',
  },
  {
    key: 'notifyStaffBookings',
    icon: UserCog,
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
