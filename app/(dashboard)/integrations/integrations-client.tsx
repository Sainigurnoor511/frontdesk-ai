'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Plug,
  MagnifyingGlass,
  CalendarCheck,
  PhoneCall,
  PlugsConnected,
  Robot,
} from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
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
  type Integration,
  type IntegrationCategory,
} from '@/lib/data/integration-catalog'
import { enableIntegration, disableIntegration } from './actions'

const CATEGORY_ALL = 'All integrations'

export function IntegrationsClient({
  enabledIntegrationSlugs,
}: {
  enabledIntegrationSlugs: string[]
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

  const connectedIntegrations = useMemo(() => {
    const enabledSet = new Set(enabledIntegrationSlugs)
    return integrationCatalog.filter((integration) =>
      enabledSet.has(integration.slug)
    )
  }, [enabledIntegrationSlugs])

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
    ? enabledIntegrationSlugs.includes(selectedIntegration.slug)
    : false

  function openBrowseDialog() {
    setBrowseSearch('')
    setActiveCategory(CATEGORY_ALL)
    setBrowseOpen(true)
  }

  function openIntegrationDialog(integration: Integration) {
    setActionError(null)
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Integrations</h1>
            <Badge variant="secondary">Alpha</Badge>
          </div>
          <p className="text-muted-foreground">
            Connect external tools and services to your account.
          </p>
        </div>
        <Button onClick={openBrowseDialog}>Add integration</Button>
      </div>

      {connectedIntegrations.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
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
          <CardContent className="flex flex-col items-center justify-center gap-6 py-16 text-center">
            <div className="space-y-2">
              <Plug className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No integrations yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Integrations connect your receptionist to the tools you already
                use, so it can work with your existing systems.
              </p>
            </div>

            <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
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
                <PlugsConnected className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Connect CRMs, payments and more
                </p>
              </div>
            </div>

            <Button onClick={openBrowseDialog}>Browse integrations</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredConnectedIntegrations.map((integration) => (
            <Card key={integration.slug}>
              <CardContent className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Robot className="h-4 w-4 text-muted-foreground" />
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
                  onClick={() => openIntegrationDialog(integration)}
                >
                  Configure
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Browse integrations catalog dialog */}
      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-3xl flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Browse integrations</DialogTitle>
            <DialogDescription>
              Connect a tool to extend what your receptionist can do.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
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
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No integrations match your search.
                </p>
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
                        <Robot className="h-4 w-4 text-muted-foreground" />
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
                          {enabledIntegrationSlugs.includes(integration.slug) && (
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
                    <Robot className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle>{selectedIntegration.name}</DialogTitle>
                    <DialogDescription>
                      {selectedIntegration.description}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-1.5 rounded-lg border p-3">
                <p className="text-sm font-medium">Settings</p>
                <p className="text-sm text-muted-foreground">
                  {selectedIntegration.settingsDescription}
                </p>
              </div>

              {actionError && (
                <p className="text-sm text-destructive">{actionError}</p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedIntegration(null)}
                >
                  Cancel
                </Button>
                {isSelectedEnabled ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isPending}
                    onClick={handleDisable}
                  >
                    Disable
                  </Button>
                ) : (
                  <Button type="button" disabled={isPending} onClick={handleEnable}>
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
