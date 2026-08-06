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
  enableIntegration,
  disableIntegration,
  configureWebhook,
} from './actions'

const CATEGORY_ALL = 'All integrations'

const fallbackIcons: Record<string, typeof Bot> = {
  'webhook-tool': Webhook,
  'sip-trunk': PhoneForwarded,
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
    if (integration.slug === WEBHOOK_SLUG) {
      const config = enabledIntegrations.find(
        (enabledIntegration) => enabledIntegration.slug === WEBHOOK_SLUG
      )?.config
      setWebhookUrl(typeof config?.url === 'string' ? config.url : '')
      setWebhookEvents(
        Array.isArray(config?.events) ? config.events.filter(isWebhookEvent) : []
      )
      setWebhookSecret(typeof config?.secret === 'string' ? config.secret : '')
    } else {
      setWebhookUrl('')
      setWebhookEvents([])
      setWebhookSecret('')
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

              {actionError && (
                <p className="text-sm text-destructive">{actionError}</p>
              )}

              {webhookConfigError && (
                <p className="text-sm text-destructive">{webhookConfigError}</p>
              )}
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
