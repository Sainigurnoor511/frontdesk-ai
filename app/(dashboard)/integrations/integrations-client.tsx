'use client'

import Image from 'next/image'
import { useMemo, useState, useTransition } from 'react'
import {
  Plug,
  Search,
  CalendarCheck,
  PhoneCall,
  PlugZap,
  Bot,
  Webhook,
  PhoneForwarded,
  Plus,
  X,
  Check,
  Unplug,
  Settings2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  integrationCatalog,
  integrationCategories,
  getIntegrationIconPath,
  type Integration,
  type IntegrationCategory,
} from '@/lib/data/integration-catalog'
import type { EnabledIntegration } from '@/lib/data/integrations'
import {
  WEBHOOK_SLUG,
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from '@/lib/integrations/webhook-events'
import {
  GOOGLE_CALENDAR_SLUG,
} from '@/lib/integrations/google-calendar-events'
import { CAL_COM_SLUG } from '@/lib/integrations/calcom'
import { CALENDLY_SLUG } from '@/lib/integrations/calendly'
import { MICROSOFT_CALENDAR_SLUG } from '@/lib/integrations/microsoft-calendar'
import {
  enableIntegration,
  disableIntegration,
  configureCalCom,
  configureCalendly,
  configurePlivo,
  configureSipTrunk,
  configureTwilio,
  configureWebhook,
} from './actions'
import {
  initiateGoogleCalendarOAuth,
  disconnectGoogleCalendar,
} from './google-calendar-actions'
import {
  initiateMicrosoftCalendarOAuth,
  disconnectMicrosoftCalendar,
} from './microsoft-calendar-actions'
import { PLIVO_SLUG, SIP_TRUNK_SLUG, TWILIO_SLUG } from '@/lib/integrations/telephony'

const CATEGORY_ALL = 'All integrations'

const fallbackIcons: Record<string, typeof Bot> = {
  'webhook-tool': Webhook,
  'sip-trunk': PhoneForwarded,
  twilio: PhoneCall,
  plivo: PhoneForwarded,
}

function isWebhookEvent(value: unknown): value is WebhookEventType {
  return (
    typeof value === 'string' && (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value)
  )
}

function IntegrationIcon({
  slug,
  className,
}: {
  slug: string
  className?: string
}) {
  const iconPath = getIntegrationIconPath(slug)
  if (!iconPath) {
    const FallbackIcon = fallbackIcons[slug] ?? Bot
    return <FallbackIcon className={cn('text-muted-foreground', className)} />
  }
  return (
    <Image
      src={iconPath}
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      unoptimized
      className={cn('object-contain', className)}
    />
  )
}

export function IntegrationsClient({
  enabledIntegrations,
}: {
  enabledIntegrations: EnabledIntegration[]
}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseSearch, setBrowseSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<
    typeof CATEGORY_ALL | IntegrationCategory
  >(CATEGORY_ALL)
  const [selectedIntegration, setSelectedIntegration] =
    useState<Integration | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventType[]>([])
  const [webhookSecret, setWebhookSecret] = useState('')
  const [webhookConfigError, setWebhookConfigError] = useState<string | null>(null)

  const [calComApiKey, setCalComApiKey] = useState('')
  const [calComEventTypeId, setCalComEventTypeId] = useState('')
  const [calComTimezone, setCalComTimezone] = useState('UTC')
  const [calComConfigError, setCalComConfigError] = useState<string | null>(null)

  const [calendlyToken, setCalendlyToken] = useState('')
  const [calendlyEventTypeUri, setCalendlyEventTypeUri] = useState('')
  const [calendlyOwnerUri, setCalendlyOwnerUri] = useState('')
  const [calendlyConfigError, setCalendlyConfigError] = useState<string | null>(null)

  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false)
  const [googleCalendarCalendarId, setGoogleCalendarCalendarId] = useState('primary')
  const [googleCalendarError, setGoogleCalendarError] = useState<string | null>(null)

  const [microsoftCalendarConnected, setMicrosoftCalendarConnected] = useState(false)
  const [microsoftCalendarError, setMicrosoftCalendarError] = useState<string | null>(null)

  const [twilioAccountSid, setTwilioAccountSid] = useState('')
  const [twilioAuthToken, setTwilioAuthToken] = useState('')
  const [twilioFromNumber, setTwilioFromNumber] = useState('')
  const [twilioWebOnly, setTwilioWebOnly] = useState(true)
  const [twilioError, setTwilioError] = useState<string | null>(null)

  const [plivoAuthId, setPlivoAuthId] = useState('')
  const [plivoAuthToken, setPlivoAuthToken] = useState('')
  const [plivoFromNumber, setPlivoFromNumber] = useState('')
  const [plivoWebOnly, setPlivoWebOnly] = useState(true)
  const [plivoError, setPlivoError] = useState<string | null>(null)

  const [sipProvider, setSipProvider] = useState('')
  const [sipTrunkDomain, setSipTrunkDomain] = useState('')
  const [sipUsername, setSipUsername] = useState('')
  const [sipPassword, setSipPassword] = useState('')
  const [sipWebOnly, setSipWebOnly] = useState(true)
  const [sipError, setSipError] = useState<string | null>(null)

  const enabledIntegrationSlugs = useMemo(
    () => new Set(enabledIntegrations.map((integration) => integration.slug)),
    [enabledIntegrations]
  )

  const connectedIntegrations = useMemo(
    () =>
      integrationCatalog.filter((integration) =>
        enabledIntegrationSlugs.has(integration.slug)
      ),
    [enabledIntegrationSlugs]
  )

  const filteredConnectedIntegrations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return connectedIntegrations
    return connectedIntegrations.filter((integration) =>
      integration.name.toLowerCase().includes(query)
    )
  }, [connectedIntegrations, search])

  const filteredCatalog = useMemo(() => {
    const query = browseSearch.trim().toLowerCase()
    return integrationCatalog.filter((integration) => {
      const matchesCategory =
        activeCategory === CATEGORY_ALL || integration.category === activeCategory
      const matchesQuery =
        !query || integration.name.toLowerCase().includes(query)
      return matchesCategory && matchesQuery
    })
  }, [activeCategory, browseSearch])

  const isSelectedEnabled = selectedIntegration
    ? enabledIntegrationSlugs.has(selectedIntegration.slug)
    : false

  function openBrowseDialog() {
    setBrowseSearch('')
    setActiveCategory(CATEGORY_ALL)
    setBrowseOpen(true)
  }

  function openIntegrationDialog(integration: Integration) {
    setActionError(null)
    setWebhookConfigError(null)
    setCalComConfigError(null)
    setCalendlyConfigError(null)
    setGoogleCalendarError(null)
    setMicrosoftCalendarError(null)
    setTwilioError(null)
    setPlivoError(null)
    setSipError(null)
    if (integration.slug === WEBHOOK_SLUG) {
      const config = enabledIntegrations.find(
        (enabledIntegration) => enabledIntegration.slug === WEBHOOK_SLUG
      )?.config
      setWebhookUrl(typeof config?.url === 'string' ? config.url : '')
      setWebhookEvents(
        Array.isArray(config?.events) ? config.events.filter(isWebhookEvent) : []
      )
      setWebhookSecret(typeof config?.secret === 'string' ? config.secret : '')
      setCalComApiKey('')
      setCalComEventTypeId('')
      setCalComTimezone('UTC')
      setCalendlyToken('')
      setCalendlyEventTypeUri('')
      setCalendlyOwnerUri('')
      setGoogleCalendarConnected(false)
      setGoogleCalendarCalendarId('primary')
      setMicrosoftCalendarConnected(false)
    } else if (integration.slug === CAL_COM_SLUG) {
      const config = enabledIntegrations.find(
        (enabledIntegration) => enabledIntegration.slug === CAL_COM_SLUG
      )?.config
      setCalComApiKey(typeof config?.apiKey === 'string' ? config.apiKey : '')
      setCalComEventTypeId(
        typeof config?.eventTypeId === 'number' ? String(config.eventTypeId) : ''
      )
      setCalComTimezone(typeof config?.timezone === 'string' ? config.timezone : 'UTC')
      setWebhookUrl('')
      setWebhookEvents([])
      setWebhookSecret('')
      setCalendlyToken('')
      setCalendlyEventTypeUri('')
      setCalendlyOwnerUri('')
      setGoogleCalendarConnected(false)
      setGoogleCalendarCalendarId('primary')
      setMicrosoftCalendarConnected(false)
      setTwilioAccountSid('')
      setTwilioAuthToken('')
      setTwilioFromNumber('')
      setTwilioWebOnly(true)
      setPlivoAuthId('')
      setPlivoAuthToken('')
      setPlivoFromNumber('')
      setPlivoWebOnly(true)
      setSipProvider('')
      setSipTrunkDomain('')
      setSipUsername('')
      setSipPassword('')
      setSipWebOnly(true)
    } else if (integration.slug === CALENDLY_SLUG) {
      const config = enabledIntegrations.find(
        (enabledIntegration) => enabledIntegration.slug === CALENDLY_SLUG
      )?.config
      setCalendlyToken(
        typeof config?.personalAccessToken === 'string' ? config.personalAccessToken : ''
      )
      setCalendlyEventTypeUri(
        typeof config?.eventTypeUri === 'string' ? config.eventTypeUri : ''
      )
      setCalendlyOwnerUri(typeof config?.ownerUri === 'string' ? config.ownerUri : '')
      setWebhookUrl('')
      setWebhookEvents([])
      setWebhookSecret('')
      setCalComApiKey('')
      setCalComEventTypeId('')
      setCalComTimezone('UTC')
      setGoogleCalendarConnected(false)
      setGoogleCalendarCalendarId('primary')
      setMicrosoftCalendarConnected(false)
      setTwilioAccountSid('')
      setTwilioAuthToken('')
      setTwilioFromNumber('')
      setTwilioWebOnly(true)
      setPlivoAuthId('')
      setPlivoAuthToken('')
      setPlivoFromNumber('')
      setPlivoWebOnly(true)
      setSipProvider('')
      setSipTrunkDomain('')
      setSipUsername('')
      setSipPassword('')
      setSipWebOnly(true)
    } else if (integration.slug === TWILIO_SLUG) {
      const config = enabledIntegrations.find(
        (enabledIntegration) => enabledIntegration.slug === TWILIO_SLUG
      )?.config
      setTwilioAccountSid(typeof config?.accountSid === 'string' ? config.accountSid : '')
      setTwilioAuthToken(typeof config?.authToken === 'string' ? config.authToken : '')
      setTwilioFromNumber(typeof config?.fromNumber === 'string' ? config.fromNumber : '')
      setTwilioWebOnly(config?.webCallsOnly !== false)
      setWebhookUrl('')
      setWebhookEvents([])
      setWebhookSecret('')
      setCalComApiKey('')
      setCalComEventTypeId('')
      setCalComTimezone('UTC')
      setCalendlyToken('')
      setCalendlyEventTypeUri('')
      setCalendlyOwnerUri('')
      setGoogleCalendarConnected(false)
      setGoogleCalendarCalendarId('primary')
      setMicrosoftCalendarConnected(false)
      setPlivoAuthId('')
      setPlivoAuthToken('')
      setPlivoFromNumber('')
      setPlivoWebOnly(true)
      setSipProvider('')
      setSipTrunkDomain('')
      setSipUsername('')
      setSipPassword('')
      setSipWebOnly(true)
    } else if (integration.slug === PLIVO_SLUG) {
      const config = enabledIntegrations.find(
        (enabledIntegration) => enabledIntegration.slug === PLIVO_SLUG
      )?.config
      setPlivoAuthId(typeof config?.authId === 'string' ? config.authId : '')
      setPlivoAuthToken(typeof config?.authToken === 'string' ? config.authToken : '')
      setPlivoFromNumber(typeof config?.fromNumber === 'string' ? config.fromNumber : '')
      setPlivoWebOnly(config?.webCallsOnly !== false)
      setWebhookUrl('')
      setWebhookEvents([])
      setWebhookSecret('')
      setCalComApiKey('')
      setCalComEventTypeId('')
      setCalComTimezone('UTC')
      setCalendlyToken('')
      setCalendlyEventTypeUri('')
      setCalendlyOwnerUri('')
      setGoogleCalendarConnected(false)
      setGoogleCalendarCalendarId('primary')
      setMicrosoftCalendarConnected(false)
      setTwilioAccountSid('')
      setTwilioAuthToken('')
      setTwilioFromNumber('')
      setTwilioWebOnly(true)
      setSipProvider('')
      setSipTrunkDomain('')
      setSipUsername('')
      setSipPassword('')
      setSipWebOnly(true)
    } else if (integration.slug === SIP_TRUNK_SLUG) {
      const config = enabledIntegrations.find(
        (enabledIntegration) => enabledIntegration.slug === SIP_TRUNK_SLUG
      )?.config
      setSipProvider(typeof config?.provider === 'string' ? config.provider : '')
      setSipTrunkDomain(typeof config?.trunkDomain === 'string' ? config.trunkDomain : '')
      setSipUsername(typeof config?.username === 'string' ? config.username : '')
      setSipPassword(typeof config?.password === 'string' ? config.password : '')
      setSipWebOnly(config?.webCallsOnly !== false)
      setWebhookUrl('')
      setWebhookEvents([])
      setWebhookSecret('')
      setCalComApiKey('')
      setCalComEventTypeId('')
      setCalComTimezone('UTC')
      setCalendlyToken('')
      setCalendlyEventTypeUri('')
      setCalendlyOwnerUri('')
      setGoogleCalendarConnected(false)
      setGoogleCalendarCalendarId('primary')
      setMicrosoftCalendarConnected(false)
      setTwilioAccountSid('')
      setTwilioAuthToken('')
      setTwilioFromNumber('')
      setTwilioWebOnly(true)
      setPlivoAuthId('')
      setPlivoAuthToken('')
      setPlivoFromNumber('')
      setPlivoWebOnly(true)
    } else if (integration.slug === GOOGLE_CALENDAR_SLUG) {
      setWebhookUrl('')
      setWebhookEvents([])
      setWebhookSecret('')
      setCalComApiKey('')
      setCalComEventTypeId('')
      setCalComTimezone('UTC')
      setCalendlyToken('')
      setCalendlyEventTypeUri('')
      setCalendlyOwnerUri('')
      const config = enabledIntegrations.find(
        (enabledIntegration) => enabledIntegration.slug === GOOGLE_CALENDAR_SLUG
      )?.config
      if (config && typeof config.calendar_id === 'string') {
        setGoogleCalendarCalendarId(config.calendar_id)
      }
      setGoogleCalendarConnected(Boolean(config))
      setMicrosoftCalendarConnected(false)
      setTwilioAccountSid('')
      setTwilioAuthToken('')
      setTwilioFromNumber('')
      setTwilioWebOnly(true)
      setPlivoAuthId('')
      setPlivoAuthToken('')
      setPlivoFromNumber('')
      setPlivoWebOnly(true)
      setSipProvider('')
      setSipTrunkDomain('')
      setSipUsername('')
      setSipPassword('')
      setSipWebOnly(true)
    } else if (integration.slug === MICROSOFT_CALENDAR_SLUG) {
      const config = enabledIntegrations.find(
        (enabledIntegration) => enabledIntegration.slug === MICROSOFT_CALENDAR_SLUG
      )?.config
      setWebhookUrl('')
      setWebhookEvents([])
      setWebhookSecret('')
      setCalComApiKey('')
      setCalComEventTypeId('')
      setCalComTimezone('UTC')
      setCalendlyToken('')
      setCalendlyEventTypeUri('')
      setCalendlyOwnerUri('')
      setGoogleCalendarConnected(false)
      setGoogleCalendarCalendarId('primary')
      setMicrosoftCalendarConnected(Boolean(config))
      setTwilioAccountSid('')
      setTwilioAuthToken('')
      setTwilioFromNumber('')
      setTwilioWebOnly(true)
      setPlivoAuthId('')
      setPlivoAuthToken('')
      setPlivoFromNumber('')
      setPlivoWebOnly(true)
      setSipProvider('')
      setSipTrunkDomain('')
      setSipUsername('')
      setSipPassword('')
      setSipWebOnly(true)
    } else {
      setWebhookUrl('')
      setWebhookEvents([])
      setWebhookSecret('')
      setCalComApiKey('')
      setCalComEventTypeId('')
      setCalComTimezone('UTC')
      setCalendlyToken('')
      setCalendlyEventTypeUri('')
      setCalendlyOwnerUri('')
      setGoogleCalendarConnected(false)
      setGoogleCalendarCalendarId('primary')
      setMicrosoftCalendarConnected(false)
      setTwilioAccountSid('')
      setTwilioAuthToken('')
      setTwilioFromNumber('')
      setTwilioWebOnly(true)
      setPlivoAuthId('')
      setPlivoAuthToken('')
      setPlivoFromNumber('')
      setPlivoWebOnly(true)
      setSipProvider('')
      setSipTrunkDomain('')
      setSipUsername('')
      setSipPassword('')
      setSipWebOnly(true)
    }
    setSelectedIntegration(integration)
  }

  function handleEnable() {
    if (!selectedIntegration) return
    setActionError(null)
    const slug = selectedIntegration.slug

    startTransition(async () => {
      const result = await enableIntegration(slug)
      if ('error' in result) {
        setActionError(result.error)
        return
      }
      setSelectedIntegration(null)
      setBrowseOpen(false)
    })
  }

  function handleDisable() {
    if (!selectedIntegration) return
    setActionError(null)
    const slug = selectedIntegration.slug

    startTransition(async () => {
      const result = await disableIntegration(slug)
      if ('error' in result) {
        setActionError(result.error)
        return
      }
      setSelectedIntegration(null)
    })
  }

  function toggleWebhookEvent(value: WebhookEventType) {
    setWebhookEvents((prev) =>
      prev.includes(value) ? prev.filter((event) => event !== value) : [...prev, value]
    )
  }

  function handleSaveWebhook() {
    if (!selectedIntegration) return
    setWebhookConfigError(null)

    startTransition(async () => {
      const result = await configureWebhook({
        url: webhookUrl,
        events: webhookEvents,
        secret: webhookSecret.trim() || undefined,
      })
      if ('error' in result) {
        setWebhookConfigError(result.error)
        return
      }
      setSelectedIntegration(null)
    })
  }

  function handleSaveCalCom() {
    if (!selectedIntegration) return
    setCalComConfigError(null)

    startTransition(async () => {
      const result = await configureCalCom({
        apiKey: calComApiKey,
        eventTypeId: Number(calComEventTypeId),
        timezone: calComTimezone || 'UTC',
      })
      if ('error' in result) {
        setCalComConfigError(result.error)
        return
      }
      setSelectedIntegration(null)
    })
  }

  function handleSaveCalendly() {
    if (!selectedIntegration) return
    setCalendlyConfigError(null)

    startTransition(async () => {
      const result = await configureCalendly({
        personalAccessToken: calendlyToken,
        eventTypeUri: calendlyEventTypeUri,
        ownerUri: calendlyOwnerUri,
      })
      if ('error' in result) {
        setCalendlyConfigError(result.error)
        return
      }
      setSelectedIntegration(null)
    })
  }

  function handleSaveTwilio() {
    if (!selectedIntegration) return
    setTwilioError(null)

    startTransition(async () => {
      const result = await configureTwilio({
        accountSid: twilioAccountSid,
        authToken: twilioAuthToken,
        fromNumber: twilioFromNumber,
        webCallsOnly: twilioWebOnly,
      })
      if ('error' in result) {
        setTwilioError(result.error)
        return
      }
      setSelectedIntegration(null)
    })
  }

  function handleSavePlivo() {
    if (!selectedIntegration) return
    setPlivoError(null)

    startTransition(async () => {
      const result = await configurePlivo({
        authId: plivoAuthId,
        authToken: plivoAuthToken,
        fromNumber: plivoFromNumber,
        webCallsOnly: plivoWebOnly,
      })
      if ('error' in result) {
        setPlivoError(result.error)
        return
      }
      setSelectedIntegration(null)
    })
  }

  function handleSaveSipTrunk() {
    if (!selectedIntegration) return
    setSipError(null)

    startTransition(async () => {
      const result = await configureSipTrunk({
        provider: sipProvider,
        trunkDomain: sipTrunkDomain,
        username: sipUsername,
        password: sipPassword,
        webCallsOnly: sipWebOnly,
      })
      if ('error' in result) {
        setSipError(result.error)
        return
      }
      setSelectedIntegration(null)
    })
  }

  function handleConnectGoogleCalendar() {
    if (!selectedIntegration) return
    setGoogleCalendarError(null)

    startTransition(async () => {
      const result = await initiateGoogleCalendarOAuth()
      if ('error' in result) {
        setGoogleCalendarError(result.error)
        return
      }
      window.location.href = result.url
    })
  }

  function handleDisconnectGoogleCalendar() {
    if (!selectedIntegration) return
    setGoogleCalendarError(null)

    startTransition(async () => {
      const result = await disconnectGoogleCalendar()
      if ('error' in result) {
        setGoogleCalendarError(result.error)
        return
      }
      setGoogleCalendarConnected(false)
      setSelectedIntegration(null)
    })
  }

  function handleConnectMicrosoftCalendar() {
    if (!selectedIntegration) return
    setMicrosoftCalendarError(null)

    startTransition(async () => {
      const result = await initiateMicrosoftCalendarOAuth()
      if ('error' in result) {
        setMicrosoftCalendarError(result.error)
        return
      }
      window.location.href = result.url
    })
  }

  function handleDisconnectMicrosoftCalendar() {
    if (!selectedIntegration) return
    setMicrosoftCalendarError(null)

    startTransition(async () => {
      const result = await disconnectMicrosoftCalendar()
      if ('error' in result) {
        setMicrosoftCalendarError(result.error)
        return
      }
      setMicrosoftCalendarConnected(false)
      setSelectedIntegration(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">Integrations</h1>
            <Badge variant="secondary">Alpha</Badge>
          </div>
          <p className="mt-1 text-sm font-normal text-[#96989d]">
            Connect external tools and services to your account.
          </p>
        </div>
        <Button className="gap-1.5" onClick={openBrowseDialog}>
          <Plus />
          Add integration
        </Button>
      </div>

      {connectedIntegrations.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search integrations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v ?? 'recent')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* TODO: wire up real sorting once integrations carry timestamps in the UI list */}
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {connectedIntegrations.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <Empty className="border-0 py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Plug />
                </EmptyMedia>
                <EmptyTitle>No integrations yet</EmptyTitle>
                <EmptyDescription>
                  Integrations connect your receptionist to the tools you already use, so it can
                  work with your existing systems.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <div className="grid w-full gap-3 sm:grid-cols-3">
                  <div className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center">
                    <CalendarCheck className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Sync your calendar to avoid double-booking
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center">
                    <PhoneCall className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Bring your own phone numbers
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center">
                    <PlugZap className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Connect CRMs, payments and more
                    </p>
                  </div>
                </div>
                <Button className="gap-1.5" onClick={openBrowseDialog}>
                  <Plus />
                  Browse integrations
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredConnectedIntegrations.map((integration) => (
            <Card key={integration.slug}>
              <CardContent className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <IntegrationIcon slug={integration.slug} className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium">{integration.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {integration.description}
                  </p>
                </div>
              </CardContent>
              <div className="flex justify-end gap-2 border-t px-4 py-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openIntegrationDialog(integration)}
                >
                  <Settings2 />
                  Configure
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Browse integrations catalog dialog */}
      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="w-full sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Browse integrations</DialogTitle>
            <DialogDescription>
              Connect a tool to extend what your receptionist can do.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search integrations"
              value={browseSearch}
              onChange={(e) => setBrowseSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
            <div className="w-44 shrink-0 space-y-1 overflow-y-auto pr-2">
              {(
                [CATEGORY_ALL, ...integrationCategories] as Array<
                  typeof CATEGORY_ALL | IntegrationCategory
                >
              ).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={cn(
                    'block w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                    activeCategory === category
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredCatalog.length === 0 ? (
                <Empty className="border-0 py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>No integrations match your search</EmptyTitle>
                    <EmptyDescription>Try a different search or category.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredCatalog.map((integration) => (
                    <button
                      key={integration.slug}
                      type="button"
                      onClick={() => openIntegrationDialog(integration)}
                      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <IntegrationIcon slug={integration.slug} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">
                            {integration.name}
                          </p>
                          {integration.isAdvanced && (
                            <Badge variant="outline" className="shrink-0">
                              Advanced
                            </Badge>
                          )}
                          {integration.availability === 'coming_soon' && (
                            <Badge variant="secondary" className="shrink-0">
                              Coming soon
                            </Badge>
                          )}
                          {integration.availability === 'available' && (
                            <Badge variant="outline" className="shrink-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                              Available
                            </Badge>
                          )}
                          {enabledIntegrationSlugs.has(integration.slug) && (
                            <Badge variant="secondary" className="shrink-0">
                              Connected
                            </Badge>
                          )}
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {integration.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Individual integration detail dialog */}
      <Dialog
        open={selectedIntegration !== null}
        onOpenChange={(open) => !open && setSelectedIntegration(null)}
      >
        <DialogContent className="sm:max-w-md">
          {selectedIntegration && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <IntegrationIcon
                      slug={selectedIntegration.slug}
                      className="h-5 w-5"
                    />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle>{selectedIntegration.name}</DialogTitle>
                    <DialogDescription>
                      {selectedIntegration.description}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <DialogBody className="space-y-4">
                <div className="space-y-1.5 rounded-lg border p-3">
                <p className="text-sm font-medium">Settings</p>
                <p className="text-sm text-muted-foreground">
                  {selectedIntegration.settingsDescription}
                </p>
                {selectedIntegration.availability === 'coming_soon' && (
                  <p className="text-sm text-muted-foreground">
                    This integration is not available to connect yet. Check back soon.
                  </p>
                )}
              </div>

              {selectedIntegration.slug === WEBHOOK_SLUG && (
                <div className="space-y-4 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <label htmlFor="webhook-url" className="text-sm font-medium">
                      Webhook URL
                    </label>
                    <Input
                      id="webhook-url"
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://hooks.example.com/receptionist"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Events</p>
                    {WEBHOOK_EVENTS.map((event) => (
                      <label
                        key={event.value}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={webhookEvents.includes(event.value)}
                          onCheckedChange={() => toggleWebhookEvent(event.value)}
                        />
                        <span className="font-medium">{event.label}</span>
                        <span className="text-muted-foreground">{event.description}</span>
                      </label>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="webhook-secret" className="text-sm font-medium">
                      Signing secret (optional)
                    </label>
                    <Input
                      id="webhook-secret"
                      type="password"
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder="Signs the X-Frontdesk-Signature header"
                    />
                  </div>
                </div>
              )}

              {selectedIntegration.slug === GOOGLE_CALENDAR_SLUG && (
                <div className="space-y-4 rounded-lg border p-3">
                  {googleCalendarConnected ? (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label htmlFor="google-calendar-id" className="text-sm font-medium">
                          Calendar ID
                        </label>
                        <Input
                          id="google-calendar-id"
                          type="text"
                          value={googleCalendarCalendarId}
                          onChange={(e) => setGoogleCalendarCalendarId(e.target.value)}
                          placeholder="primary"
                        />
                        <p className="text-xs text-muted-foreground">
                          Usually "primary" for your main calendar, or the email address of a shared calendar.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <Check className="h-4 w-4" />
                          Connected to Google Calendar
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleDisconnectGoogleCalendar}
                      >
                        <Unplug />
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Connect your Google Calendar to sync appointments and availability.
                      </p>
                      <Button
                        type="button"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleConnectGoogleCalendar}
                      >
                        <Plug />
                        Connect Google Calendar
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {selectedIntegration.slug === CAL_COM_SLUG && (
                <div className="space-y-4 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <label htmlFor="calcom-api-key" className="text-sm font-medium">
                      API key
                    </label>
                    <Input
                      id="calcom-api-key"
                      type="password"
                      value={calComApiKey}
                      onChange={(e) => setCalComApiKey(e.target.value)}
                      placeholder="cal_..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="calcom-event-type-id" className="text-sm font-medium">
                      Event type ID
                    </label>
                    <Input
                      id="calcom-event-type-id"
                      type="number"
                      min={1}
                      value={calComEventTypeId}
                      onChange={(e) => setCalComEventTypeId(e.target.value)}
                      placeholder="123"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="calcom-timezone" className="text-sm font-medium">
                      Timezone
                    </label>
                    <Input
                      id="calcom-timezone"
                      type="text"
                      value={calComTimezone}
                      onChange={(e) => setCalComTimezone(e.target.value)}
                      placeholder="America/New_York"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used for attendee timezone when creating Cal.com bookings.
                    </p>
                  </div>
                </div>
              )}

              {selectedIntegration.slug === TWILIO_SLUG && (
                <div className="space-y-4 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <label htmlFor="twilio-account-sid" className="text-sm font-medium">
                      Account SID
                    </label>
                    <Input
                      id="twilio-account-sid"
                      value={twilioAccountSid}
                      onChange={(e) => setTwilioAccountSid(e.target.value)}
                      placeholder="AC..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="twilio-auth-token" className="text-sm font-medium">
                      Auth token
                    </label>
                    <Input
                      id="twilio-auth-token"
                      type="password"
                      value={twilioAuthToken}
                      onChange={(e) => setTwilioAuthToken(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="twilio-from-number" className="text-sm font-medium">
                      Default from number
                    </label>
                    <Input
                      id="twilio-from-number"
                      value={twilioFromNumber}
                      onChange={(e) => setTwilioFromNumber(e.target.value)}
                      placeholder="+14155551234"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={twilioWebOnly}
                      onCheckedChange={(checked) => setTwilioWebOnly(checked !== false)}
                    />
                    Web calls only (default, no number provisioning)
                  </label>
                </div>
              )}

              {selectedIntegration.slug === PLIVO_SLUG && (
                <div className="space-y-4 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <label htmlFor="plivo-auth-id" className="text-sm font-medium">
                      Auth ID
                    </label>
                    <Input
                      id="plivo-auth-id"
                      value={plivoAuthId}
                      onChange={(e) => setPlivoAuthId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="plivo-auth-token" className="text-sm font-medium">
                      Auth token
                    </label>
                    <Input
                      id="plivo-auth-token"
                      type="password"
                      value={plivoAuthToken}
                      onChange={(e) => setPlivoAuthToken(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="plivo-from-number" className="text-sm font-medium">
                      Default from number
                    </label>
                    <Input
                      id="plivo-from-number"
                      value={plivoFromNumber}
                      onChange={(e) => setPlivoFromNumber(e.target.value)}
                      placeholder="+14155551234"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={plivoWebOnly}
                      onCheckedChange={(checked) => setPlivoWebOnly(checked !== false)}
                    />
                    Web calls only (default, no number provisioning)
                  </label>
                </div>
              )}

              {selectedIntegration.slug === SIP_TRUNK_SLUG && (
                <div className="space-y-4 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <label htmlFor="sip-provider" className="text-sm font-medium">
                      Provider
                    </label>
                    <Input
                      id="sip-provider"
                      value={sipProvider}
                      onChange={(e) => setSipProvider(e.target.value)}
                      placeholder="Twilio SIP Trunking / Plivo / BYO"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="sip-domain" className="text-sm font-medium">
                      Trunk domain
                    </label>
                    <Input
                      id="sip-domain"
                      value={sipTrunkDomain}
                      onChange={(e) => setSipTrunkDomain(e.target.value)}
                      placeholder="example.pstn.twilio.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="sip-username" className="text-sm font-medium">
                      Username
                    </label>
                    <Input
                      id="sip-username"
                      value={sipUsername}
                      onChange={(e) => setSipUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="sip-password" className="text-sm font-medium">
                      Password
                    </label>
                    <Input
                      id="sip-password"
                      type="password"
                      value={sipPassword}
                      onChange={(e) => setSipPassword(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={sipWebOnly}
                      onCheckedChange={(checked) => setSipWebOnly(checked !== false)}
                    />
                    Web calls only (default, SIP inbound disabled)
                  </label>
                </div>
              )}

              {selectedIntegration.slug === CALENDLY_SLUG && (
                <div className="space-y-4 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <label htmlFor="calendly-token" className="text-sm font-medium">
                      Personal access token
                    </label>
                    <Input
                      id="calendly-token"
                      type="password"
                      value={calendlyToken}
                      onChange={(e) => setCalendlyToken(e.target.value)}
                      placeholder="CALENDLY_PAT..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="calendly-event-type-uri" className="text-sm font-medium">
                      Event type URI
                    </label>
                    <Input
                      id="calendly-event-type-uri"
                      type="url"
                      value={calendlyEventTypeUri}
                      onChange={(e) => setCalendlyEventTypeUri(e.target.value)}
                      placeholder="https://api.calendly.com/event_types/..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="calendly-owner-uri" className="text-sm font-medium">
                      Owner URI
                    </label>
                    <Input
                      id="calendly-owner-uri"
                      type="url"
                      value={calendlyOwnerUri}
                      onChange={(e) => setCalendlyOwnerUri(e.target.value)}
                      placeholder="https://api.calendly.com/users/..."
                    />
                  </div>
                </div>
              )}

              {selectedIntegration.slug === MICROSOFT_CALENDAR_SLUG && (
                <div className="space-y-4 rounded-lg border p-3">
                  {microsoftCalendarConnected ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <Check className="h-4 w-4" />
                          Connected to Microsoft Calendar
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleDisconnectMicrosoftCalendar}
                      >
                        <Unplug />
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Connect your Microsoft Calendar to sync appointments and availability.
                      </p>
                      <Button
                        type="button"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleConnectMicrosoftCalendar}
                      >
                        <Plug />
                        Connect Microsoft Calendar
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {actionError && (
                <p className="text-sm text-destructive">{actionError}</p>
              )}

              {webhookConfigError && (
                <p className="text-sm text-destructive">{webhookConfigError}</p>
              )}

              {googleCalendarError && (
                <p className="text-sm text-destructive">{googleCalendarError}</p>
              )}

              {calComConfigError && (
                <p className="text-sm text-destructive">{calComConfigError}</p>
              )}

              {calendlyConfigError && (
                <p className="text-sm text-destructive">{calendlyConfigError}</p>
              )}

              {microsoftCalendarError && (
                <p className="text-sm text-destructive">{microsoftCalendarError}</p>
              )}

              {twilioError && <p className="text-sm text-destructive">{twilioError}</p>}

              {plivoError && <p className="text-sm text-destructive">{plivoError}</p>}

              {sipError && <p className="text-sm text-destructive">{sipError}</p>}
              </DialogBody>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setSelectedIntegration(null)}
                >
                  <X />
                  Cancel
                </Button>
                {selectedIntegration.slug === WEBHOOK_SLUG ? (
                  <>
                    {isSelectedEnabled && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleDisable}
                      >
                        <Unplug />
                        Disable
                      </Button>
                    )}
                    <Button type="button" className="gap-1.5" disabled={isPending} onClick={handleSaveWebhook}>
                      <Check />
                      Save
                    </Button>
                  </>
                ) : selectedIntegration.slug === CAL_COM_SLUG ? (
                  <>
                    {isSelectedEnabled && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleDisable}
                      >
                        <Unplug />
                        Disable
                      </Button>
                    )}
                    <Button type="button" className="gap-1.5" disabled={isPending} onClick={handleSaveCalCom}>
                      <Check />
                      Save
                    </Button>
                  </>
                ) : selectedIntegration.slug === CALENDLY_SLUG ? (
                  <>
                    {isSelectedEnabled && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleDisable}
                      >
                        <Unplug />
                        Disable
                      </Button>
                    )}
                    <Button
                      type="button"
                      className="gap-1.5"
                      disabled={isPending}
                      onClick={handleSaveCalendly}
                    >
                      <Check />
                      Save
                    </Button>
                  </>
                ) : selectedIntegration.slug === TWILIO_SLUG ? (
                  <>
                    {isSelectedEnabled && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleDisable}
                      >
                        <Unplug />
                        Disable
                      </Button>
                    )}
                    <Button
                      type="button"
                      className="gap-1.5"
                      disabled={isPending}
                      onClick={handleSaveTwilio}
                    >
                      <Check />
                      Save
                    </Button>
                  </>
                ) : selectedIntegration.slug === PLIVO_SLUG ? (
                  <>
                    {isSelectedEnabled && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleDisable}
                      >
                        <Unplug />
                        Disable
                      </Button>
                    )}
                    <Button
                      type="button"
                      className="gap-1.5"
                      disabled={isPending}
                      onClick={handleSavePlivo}
                    >
                      <Check />
                      Save
                    </Button>
                  </>
                ) : selectedIntegration.slug === SIP_TRUNK_SLUG ? (
                  <>
                    {isSelectedEnabled && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={handleDisable}
                      >
                        <Unplug />
                        Disable
                      </Button>
                    )}
                    <Button
                      type="button"
                      className="gap-1.5"
                      disabled={isPending}
                      onClick={handleSaveSipTrunk}
                    >
                      <Check />
                      Save
                    </Button>
                  </>
                ) : selectedIntegration.slug === GOOGLE_CALENDAR_SLUG ? (
                  <></>
                ) : selectedIntegration.slug === MICROSOFT_CALENDAR_SLUG ? (
                  <></>
                ) : selectedIntegration.availability === 'coming_soon' ? (
                  <Button type="button" disabled>
                    Coming soon
                  </Button>
                ) : isSelectedEnabled ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="gap-1.5"
                    disabled={isPending}
                    onClick={handleDisable}
                  >
                    <Unplug />
                    Disable
                  </Button>
                ) : (
                  <Button type="button" className="gap-1.5" disabled={isPending} onClick={handleEnable}>
                    <Plug />
                    Enable
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
