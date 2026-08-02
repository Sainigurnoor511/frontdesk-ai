'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Storefront,
  MagnifyingGlass,
  PencilSimple,
  Trash,
  Plus,
  MapPin,
  Cube,
  Package,
  BookOpen,
  Question,
} from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@/components/ui/empty'
import { countries } from '@/lib/data/countries'
import type {
  BusinessProfile,
  BusinessLocation,
  Service,
  BusinessAsset,
  BusinessProduct,
} from '@/lib/data/business'
import { toast } from 'sonner'
import {
  updateBusinessProfile,
  createLocation,
  createService,
  updateService,
  deleteService,
  createAsset,
  updateAsset,
  deleteAsset,
  createProduct,
  updateProduct,
  deleteProduct,
  updateSchedulingSettings,
} from './actions'

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR']

const SERVICE_TYPES: { value: Service['serviceType']; label: string }[] = [
  { value: 'appointment', label: 'Appointment' },
  { value: 'home_mobile', label: 'Home & mobile' },
  { value: 'group_session', label: 'Group session' },
  { value: 'rental', label: 'Rental' },
]

function formatPrice(price: number) {
  return `$${price.toFixed(2)}`
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export function BusinessClient({
  profile,
  locations,
  services,
  assets,
  products,
  contactPhoneNumber,
}: {
  profile: BusinessProfile
  locations: BusinessLocation[]
  services: Service[]
  assets: BusinessAsset[]
  products: BusinessProduct[]
  contactPhoneNumber: string | null
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Business</h1>
        <p className="mt-1 text-sm font-normal text-[#96989d]">
          Your business profile, services, and scheduling settings.
        </p>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge Sources</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6 pt-4">
          <InfoTab profile={profile} locations={locations} contactPhoneNumber={contactPhoneNumber} />
        </TabsContent>

        <TabsContent value="services" className="pt-4">
          <ServicesTab services={services} />
        </TabsContent>

        <TabsContent value="assets" className="pt-4">
          <AssetsTab assets={assets} />
        </TabsContent>

        <TabsContent value="products" className="pt-4">
          <ProductsTab products={products} />
        </TabsContent>

        <TabsContent value="scheduling" className="pt-4">
          <SchedulingTab profile={profile} />
        </TabsContent>

        <TabsContent value="knowledge" className="pt-4">
          <KnowledgeSourcesTab />
        </TabsContent>

        <TabsContent value="faq" className="pt-4">
          <FaqTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------- Info Tab ----------------

function InfoTab({
  profile,
  locations,
  contactPhoneNumber,
}: {
  profile: BusinessProfile
  locations: BusinessLocation[]
  contactPhoneNumber: string | null
}) {
  const [businessName, setBusinessName] = useState(profile.businessName ?? '')
  const [country, setCountry] = useState(profile.country ?? '')
  const [timezone, setTimezone] = useState(profile.timezone)
  const [currency, setCurrency] = useState(profile.currency)
  const [isPending, startTransition] = useTransition()
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)

  function handleSave() {
    startTransition(async () => {
      const result = await updateBusinessProfile({
        businessName,
        country: country || undefined,
        timezone,
        currency,
      })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Business info saved.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="business-name">Business Name</Label>
              <Input
                id="business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Select value={country} onValueChange={(v) => setCountry(v ?? "")}>
                <SelectTrigger id="country" className="w-full">
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={(v) => setTimezone(v ?? "")}>
                <SelectTrigger id="timezone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v ?? "")}>
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Contact Info</h3>
          <p className="text-sm text-muted-foreground">
            {contactPhoneNumber ? contactPhoneNumber : 'No phone number configured yet.'}
          </p>
          <p className="text-xs text-muted-foreground">
            Manage in{' '}
            <Link href="/agents" className="underline underline-offset-4">
              Receptionists
            </Link>{' '}
            / Call settings.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Locations and Hours</h3>
              <p className="text-sm text-muted-foreground">
                {locations.length} location{locations.length === 1 ? '' : 's'}
              </p>
            </div>
            <Button size="sm" onClick={() => setLocationDialogOpen(true)}>
              Add location
            </Button>
          </div>

          {locations.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {locations.map((location) => (
                <li
                  key={location.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <MapPin className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium">{location.name}</p>
                      {location.address && (
                        <p className="text-sm text-muted-foreground">{location.address}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={location.isActive ? 'default' : 'outline'}>
                    {location.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddLocationDialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen} />
    </div>
  )
}

function AddLocationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setName('')
    setAddress('')
    setIsActive(true)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await createLocation({ name, address: address || undefined, isActive })
      if ('error' in result) {
        setError(result.error)
        return
      }
      reset()
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add location</DialogTitle>
            <DialogDescription>Add a new location for your business.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="location-name">Name</Label>
              <Input
                id="location-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location-address">Address</Label>
              <Input
                id="location-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch id="location-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="location-active">Active</Label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              Add location
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- Services Tab ----------------

type ServiceFormState = {
  id?: string
  name: string
  description: string
  durationMinutes: string
  price: string
  serviceType: Service['serviceType']
}

const emptyServiceForm: ServiceFormState = {
  name: '',
  description: '',
  durationMinutes: '',
  price: '',
  serviceType: 'appointment',
}

function ServicesTab({ services }: { services: Service[] }) {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ServiceFormState>(emptyServiceForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEditMode = Boolean(form.id)

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return services
    return services.filter((service) => service.name.toLowerCase().includes(query))
  }, [services, search])

  function openAddDialog() {
    setForm(emptyServiceForm)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(service: Service) {
    setForm({
      id: service.id,
      name: service.name,
      description: service.description ?? '',
      durationMinutes: String(service.durationMinutes),
      price: String(service.price),
      serviceType: service.serviceType,
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const durationMinutes = Number(form.durationMinutes)
    const price = Number(form.price)

    if (!Number.isFinite(durationMinutes) || !Number.isFinite(price)) {
      setFormError('Duration and price must be valid numbers.')
      return
    }

    startTransition(async () => {
      const result = form.id
        ? await updateService({
            id: form.id,
            name: form.name,
            description: form.description || undefined,
            durationMinutes,
            price,
            serviceType: form.serviceType,
          })
        : await createService({
            name: form.name,
            description: form.description || undefined,
            durationMinutes,
            price,
            serviceType: form.serviceType,
          })

      if ('error' in result) {
        setFormError(result.error)
        return
      }

      setDialogOpen(false)
      setForm(emptyServiceForm)
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget

    startTransition(async () => {
      await deleteService(target.id)
      setDeleteTarget(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search services"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {/* TODO: wire these filters up to real filtering logic */}
          <Button type="button" variant="outline" size="sm">
            Type
          </Button>
          <Button type="button" variant="outline" size="sm">
            Price
          </Button>
          <Button type="button" variant="outline" size="sm">
            Duration
          </Button>
          <Button type="button" variant="outline" size="sm">
            Staff
          </Button>
          <Button type="button" variant="outline" size="sm">
            Assets
          </Button>
        </div>
        <Button onClick={openAddDialog}>Add service</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredServices.length === 0 ? (
            services.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Storefront />
                  </EmptyMedia>
                  <EmptyTitle>Create your first service</EmptyTitle>
                  <EmptyDescription>
                    Services are what your receptionist books for callers.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <div className="grid w-full gap-2 text-left sm:grid-cols-3">
                    <InfoCard title="Set a name, duration, and price" />
                    <InfoCard title="Choose who can perform it" />
                    <InfoCard title="Customers can book it online" />
                  </div>
                  <Button onClick={openAddDialog} className="mt-2">
                    Create service
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <p className="font-medium">No matching services</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Try a different search term.
                </p>
              </div>
            )
          ) : (
            <ul className="divide-y">
              {filteredServices.map((service) => (
                <li
                  key={service.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium">{service.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDuration(service.durationMinutes)} · {formatPrice(service.price)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${service.name}`}
                      onClick={() => openEditDialog(service)}
                    >
                      <PencilSimple />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${service.name}`}
                      onClick={() => setDeleteTarget(service)}
                    >
                      <Trash />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit service' : 'Add service'}</DialogTitle>
              <DialogDescription>
                {isEditMode ? "Update this service's details." : 'Add a new service.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="service-name">Name</Label>
                <Input
                  id="service-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="service-description">Description</Label>
                <Textarea
                  id="service-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="service-duration">Duration (minutes)</Label>
                  <Input
                    id="service-duration"
                    type="number"
                    min={1}
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="service-price">Price</Label>
                  <Input
                    id="service-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="service-type">Type</Label>
                <Select
                  value={form.serviceType}
                  onValueChange={(value) =>
                    setForm({ ...form, serviceType: value as Service['serviceType'] })
                  }
                >
                  <SelectTrigger id="service-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isEditMode ? 'Save changes' : 'Add service'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the service permanently. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function InfoCard({ title }: { title: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
      {title}
    </div>
  )
}

// ---------------- Assets Tab ----------------

type AssetFormState = {
  id?: string
  name: string
  description: string
  isActive: boolean
}

const emptyAssetForm: AssetFormState = { name: '', description: '', isActive: true }

function AssetsTab({ assets }: { assets: BusinessAsset[] }) {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<AssetFormState>(emptyAssetForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BusinessAsset | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEditMode = Boolean(form.id)

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return assets
    return assets.filter((asset) => asset.name.toLowerCase().includes(query))
  }, [assets, search])

  function openAddDialog() {
    setForm(emptyAssetForm)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(asset: BusinessAsset) {
    setForm({
      id: asset.id,
      name: asset.name,
      description: asset.description ?? '',
      isActive: asset.isActive,
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    startTransition(async () => {
      const result = form.id
        ? await updateAsset({
            id: form.id,
            name: form.name,
            description: form.description || undefined,
            isActive: form.isActive,
          })
        : await createAsset({
            name: form.name,
            description: form.description || undefined,
            isActive: form.isActive,
          })

      if ('error' in result) {
        setFormError(result.error)
        return
      }

      setDialogOpen(false)
      setForm(emptyAssetForm)
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget

    startTransition(async () => {
      await deleteAsset(target.id)
      setDeleteTarget(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative max-w-sm flex-1">
          <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search assets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={openAddDialog}>Add asset</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredAssets.length === 0 ? (
            assets.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Cube />
                  </EmptyMedia>
                  <EmptyTitle>No assets yet</EmptyTitle>
                  <EmptyDescription>
                    Assets are bookable resources - like rooms or equipment.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={openAddDialog}>Add asset</Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <p className="font-medium">No matching assets</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Try a different search term.
                </p>
              </div>
            )
          ) : (
            <ul className="divide-y">
              {filteredAssets.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium">{asset.name}</p>
                    {asset.description && (
                      <p className="text-sm text-muted-foreground">{asset.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={asset.isActive ? 'default' : 'outline'}>
                      {asset.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${asset.name}`}
                      onClick={() => openEditDialog(asset)}
                    >
                      <PencilSimple />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${asset.name}`}
                      onClick={() => setDeleteTarget(asset)}
                    >
                      <Trash />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit asset' : 'Add asset'}</DialogTitle>
              <DialogDescription>
                {isEditMode ? "Update this asset's details." : 'Add a new bookable asset.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-name">Name</Label>
                <Input
                  id="asset-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-description">Description</Label>
                <Textarea
                  id="asset-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="asset-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
                <Label htmlFor="asset-active">Active</Label>
              </div>

              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isEditMode ? 'Save changes' : 'Add asset'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the asset permanently. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------- Products Tab ----------------

type ProductFormState = {
  id?: string
  name: string
  description: string
  price: string
}

const emptyProductForm: ProductFormState = { name: '', description: '', price: '' }

function ProductsTab({ products }: { products: BusinessProduct[] }) {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ProductFormState>(emptyProductForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BusinessProduct | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEditMode = Boolean(form.id)

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return products
    return products.filter((product) => product.name.toLowerCase().includes(query))
  }, [products, search])

  function openAddDialog() {
    setForm(emptyProductForm)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(product: BusinessProduct) {
    setForm({
      id: product.id,
      name: product.name,
      description: product.description ?? '',
      price: String(product.price),
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const price = Number(form.price)
    if (!Number.isFinite(price)) {
      setFormError('Price must be a valid number.')
      return
    }

    startTransition(async () => {
      const result = form.id
        ? await updateProduct({
            id: form.id,
            name: form.name,
            description: form.description || undefined,
            price,
          })
        : await createProduct({
            name: form.name,
            description: form.description || undefined,
            price,
          })

      if ('error' in result) {
        setFormError(result.error)
        return
      }

      setDialogOpen(false)
      setForm(emptyProductForm)
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget

    startTransition(async () => {
      await deleteProduct(target.id)
      setDeleteTarget(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative max-w-sm flex-1">
          <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={openAddDialog}>Add product</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredProducts.length === 0 ? (
            products.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Package />
                  </EmptyMedia>
                  <EmptyTitle>No products yet</EmptyTitle>
                  <EmptyDescription>
                    Products are items you sell alongside your services.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={openAddDialog}>Add product</Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <p className="font-medium">No matching products</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Try a different search term.
                </p>
              </div>
            )
          ) : (
            <ul className="divide-y">
              {filteredProducts.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatPrice(product.price)}
                      {product.description ? ` · ${product.description}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${product.name}`}
                      onClick={() => openEditDialog(product)}
                    >
                      <PencilSimple />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${product.name}`}
                      onClick={() => setDeleteTarget(product)}
                    >
                      <Trash />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit product' : 'Add product'}</DialogTitle>
              <DialogDescription>
                {isEditMode ? "Update this product's details." : 'Add a new product.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-name">Name</Label>
                <Input
                  id="product-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="product-description">Description</Label>
                <Textarea
                  id="product-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="product-price">Price</Label>
                <Input
                  id="product-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </div>

              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isEditMode ? 'Save changes' : 'Add product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the product permanently. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------- Scheduling Tab ----------------

const SLOT_INTERVALS = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '60 min' },
]

const ADVANCE_WINDOWS = [
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: '1 month' },
  { value: '90', label: '3 months' },
]

const MINIMUM_NOTICES = [
  { value: '0', label: 'No minimum' },
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: '1440', label: '24 hours' },
]

function SchedulingTab({ profile }: { profile: BusinessProfile }) {
  const [slotInterval, setSlotInterval] = useState(String(profile.bookingSlotIntervalMinutes))
  const [advanceWindow, setAdvanceWindow] = useState(String(profile.advanceBookingWindowDays))
  const [minimumNotice, setMinimumNotice] = useState(String(profile.minimumBookingNoticeMinutes))
  const [limitOverlapping, setLimitOverlapping] = useState(profile.limitOverlappingAppointments)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await updateSchedulingSettings({
        bookingSlotIntervalMinutes: Number(slotInterval),
        advanceBookingWindowDays: Number(advanceWindow),
        minimumBookingNoticeMinutes: Number(minimumNotice),
        limitOverlappingAppointments: limitOverlapping,
      })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Scheduling settings saved.')
      }
    })
  }

  return (
    <Card>
      <CardContent className="space-y-6 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="slot-interval">Booking time slot interval</Label>
            <Select value={slotInterval} onValueChange={(v) => setSlotInterval(v ?? "")}>
              <SelectTrigger id="slot-interval" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_INTERVALS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="advance-window">Advance booking window</Label>
            <Select value={advanceWindow} onValueChange={(v) => setAdvanceWindow(v ?? "")}>
              <SelectTrigger id="advance-window" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADVANCE_WINDOWS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="minimum-notice">Minimum booking notice</Label>
            <Select value={minimumNotice} onValueChange={(v) => setMinimumNotice(v ?? "")}>
              <SelectTrigger id="minimum-notice" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MINIMUM_NOTICES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Limit overlapping appointments</p>
            <p className="text-sm text-muted-foreground">
              Set a limit on overlapping appointments.
            </p>
          </div>
          <Switch checked={limitOverlapping} onCheckedChange={setLimitOverlapping} />
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------- Knowledge Sources Tab ----------------

// TODO: this project already has website-scanning infrastructure
// (see app/onboarding/actions.ts's startWebsiteScan and the agent_scan_jobs
// table) that could be reused here to power real knowledge-source ingestion.
// That integration is tied to the onboarding agent-creation flow today; wiring
// this tab up to it is a separate follow-up task. For now this is UI only.
function KnowledgeSourcesTab() {
  return (
    <Card>
      <CardContent className="py-10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>No knowledge sources yet</EmptyTitle>
            <EmptyDescription>
              Knowledge sources are where your receptionist learns about your business, so
              it can answer callers accurately.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="grid w-full gap-2 text-left sm:grid-cols-3">
              <InfoCard title="Upload files like PDFs and docs" />
              <InfoCard title="Add your website or specific pages" />
              <InfoCard title="Your receptionist answers from them" />
            </div>
            <Button className="mt-2">Add new</Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
}

// ---------------- FAQ Tab ----------------

// TODO: FAQs are meant to be auto-captured when the receptionist can't answer
// a caller's question. That requires conversations + AI-answer-gap detection,
// which doesn't exist yet. This tab is genuinely empty until that lands.
function FaqTab() {
  return (
    <Card>
      <CardContent className="py-10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Question />
            </EmptyMedia>
            <EmptyTitle>No FAQs yet</EmptyTitle>
            <EmptyDescription>
              When your receptionist can&apos;t answer a caller&apos;s question, it shows up
              here so you can fill the gap.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="grid w-full gap-2 text-left sm:grid-cols-1">
              <InfoCard title="Captured when a caller asks something new" />
              <InfoCard title="You add an answer once" />
              <InfoCard title="Your receptionist reuses it next time" />
            </div>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
}
