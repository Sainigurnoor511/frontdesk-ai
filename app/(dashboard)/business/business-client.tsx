'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Store,
  Search,
  Pencil,
  Trash,
  Plus,
  MapPin,
  Box,
  Package,
  BookOpen,
  CircleQuestionMark,
  Globe,
  FileText,
  Upload,
  X,
  Check,
  Tag,
  ArrowUpDown,
  Clock,
  Users,
} from 'lucide-react'
import { FilterMenuButton, FilterToggleButton } from '@/components/layout/filter-menu-button'
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
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import type { KnowledgeSource, Faq } from '@/lib/data/knowledge'
import { toast } from 'sonner'
import { UnsavedChangesBar } from '@/components/layout/unsaved-changes-bar'
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
import {
  addKnowledgeWebsite,
  uploadKnowledgeFile,
  deleteKnowledgeSource,
  createFaq,
  updateFaq,
  deleteFaq,
} from './knowledge-actions'

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

const BUSINESS_TAB_VALUES = [
  'info',
  'services',
  'assets',
  'products',
  'scheduling',
  'knowledge',
  'faq',
] as const

export function BusinessClient({
  profile,
  locations,
  services,
  assets,
  products,
  contactPhoneNumber,
  knowledgeSources,
  faqs,
  initialTab,
}: {
  profile: BusinessProfile
  locations: BusinessLocation[]
  services: Service[]
  assets: BusinessAsset[]
  products: BusinessProduct[]
  contactPhoneNumber: string | null
  knowledgeSources: KnowledgeSource[]
  faqs: Faq[]
  initialTab?: string
}) {
  const activeTab = BUSINESS_TAB_VALUES.includes(
    initialTab as (typeof BUSINESS_TAB_VALUES)[number]
  )
    ? (initialTab as (typeof BUSINESS_TAB_VALUES)[number])
    : 'info'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{profile.businessName || 'Business'}</h1>
        <p className="mt-1 text-sm font-normal text-[#96989d]">
          Your business profile, services, and scheduling settings.
        </p>
      </div>

      <Tabs defaultValue={activeTab}>
        <TabsList variant="line" className="w-full justify-start gap-1 border-b [&>*]:flex-none">
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
          <KnowledgeSourcesTab sources={knowledgeSources} />
        </TabsContent>

        <TabsContent value="faq" className="pt-4">
          <FaqTab faqs={faqs} />
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

  const dirty =
    businessName !== (profile.businessName ?? '') ||
    country !== (profile.country ?? '') ||
    timezone !== profile.timezone ||
    currency !== profile.currency

  function handleCancel() {
    setBusinessName(profile.businessName ?? '')
    setCountry(profile.country ?? '')
    setTimezone(profile.timezone)
    setCurrency(profile.currency)
  }

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
    <div>
      <div className="flex items-start justify-between gap-6 border-b py-6 first:pt-0">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Business Name</h3>
          <p className="text-sm text-muted-foreground">The name of your business as shown to clients.</p>
        </div>
        <Input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="w-72 shrink-0"
        />
      </div>

      <div className="flex items-start justify-between gap-6 border-b py-6">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Country</h3>
          <p className="text-sm text-muted-foreground">The country where your business is based.</p>
        </div>
        <Select value={country} onValueChange={(v) => setCountry(v ?? '')}>
          <SelectTrigger className="w-72 shrink-0">
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

      <div className="flex items-start justify-between gap-6 border-b py-6">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Timezone</h3>
          <p className="text-sm text-muted-foreground">All appointment times will be shown in this timezone.</p>
        </div>
        <Select value={timezone} onValueChange={(v) => setTimezone(v ?? '')}>
          <SelectTrigger className="w-72 shrink-0">
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

      <div className="flex items-start justify-between gap-6 border-b py-6">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Currency</h3>
          <p className="text-sm text-muted-foreground">All prices will be displayed in this currency.</p>
        </div>
        <Select value={currency} onValueChange={(v) => setCurrency(v ?? '')}>
          <SelectTrigger className="w-72 shrink-0">
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

      <div className="flex items-start justify-between gap-6 border-b py-6">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Contact Info</h3>
          <p className="text-sm text-muted-foreground">
            Your assigned phone numbers. Manage them in{' '}
            <Link href="/agents" className="underline underline-offset-4">
              Receptionists / Call Settings
            </Link>
            .
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium">
          {contactPhoneNumber ? contactPhoneNumber : 'No phone number configured yet.'}
        </p>
      </div>

      <div className="flex items-start justify-between gap-6 py-6 last:border-0">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Locations and Hours</h3>
          <p className="text-sm text-muted-foreground">
            Physical places your business operates, their addresses and operating hours.
          </p>
        </div>
        <div className="shrink-0 space-y-3 text-right">
          <p className="text-sm text-muted-foreground">
            {locations.length} location{locations.length === 1 ? '' : 's'}
          </p>
          <Button size="sm" onClick={() => setLocationDialogOpen(true)}>
            Add location
          </Button>
        </div>
      </div>

      {locations.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {locations.map((location) => (
            <li key={location.id} className="flex items-center justify-between gap-4 px-4 py-3">
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

      <AddLocationDialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen} />

      <UnsavedChangesBar
        show={dirty}
        saving={isPending}
        onSave={handleSave}
        onCancel={handleCancel}
      />
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
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <DialogHeader>
            <DialogTitle>Add location</DialogTitle>
            <DialogDescription>Add a new location for your business.</DialogDescription>
          </DialogHeader>

          <DialogBody>
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
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => onOpenChange(false)}>
              <X />
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5" disabled={isPending}>
              <Plus />
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
  const [typeFilter, setTypeFilter] = useState<Service['serviceType'] | null>(null)
  const [durationFilter, setDurationFilter] = useState<'short' | 'medium' | 'long' | null>(null)
  const [priceSort, setPriceSort] = useState<'asc' | 'desc' | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ServiceFormState>(emptyServiceForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEditMode = Boolean(form.id)

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase()
    let result = services
    if (query) {
      result = result.filter((service) => service.name.toLowerCase().includes(query))
    }
    if (typeFilter) {
      result = result.filter((service) => service.serviceType === typeFilter)
    }
    if (durationFilter === 'short') {
      result = result.filter((service) => service.durationMinutes <= 30)
    } else if (durationFilter === 'medium') {
      result = result.filter(
        (service) => service.durationMinutes > 30 && service.durationMinutes <= 60
      )
    } else if (durationFilter === 'long') {
      result = result.filter((service) => service.durationMinutes > 60)
    }
    if (priceSort) {
      result = [...result].sort((a, b) =>
        priceSort === 'asc' ? a.price - b.price : b.price - a.price
      )
    }
    return result
  }, [services, search, typeFilter, durationFilter, priceSort])

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
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search services"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <FilterMenuButton icon={Tag} label="Type" active={typeFilter !== null}>
            <DropdownMenuItem onClick={() => setTypeFilter(null)}>All types</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTypeFilter('appointment')}>
              Appointment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTypeFilter('home_mobile')}>
              Home / mobile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTypeFilter('group_session')}>
              Group session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTypeFilter('rental')}>Rental</DropdownMenuItem>
          </FilterMenuButton>

          <FilterMenuButton icon={ArrowUpDown} label="Price" active={priceSort !== null}>
            <DropdownMenuItem onClick={() => setPriceSort(null)}>Default order</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPriceSort('asc')}>Low to high</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPriceSort('desc')}>High to low</DropdownMenuItem>
          </FilterMenuButton>

          <FilterMenuButton icon={Clock} label="Duration" active={durationFilter !== null}>
            <DropdownMenuItem onClick={() => setDurationFilter(null)}>Any duration</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDurationFilter('short')}>
              Up to 30 min
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDurationFilter('medium')}>
              31–60 min
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDurationFilter('long')}>
              Over 60 min
            </DropdownMenuItem>
          </FilterMenuButton>

          <FilterToggleButton
            icon={Users}
            label="Staff"
            disabled
            title="Coming soon"
            onClick={() => undefined}
          />
          <FilterToggleButton
            icon={Box}
            label="Assets"
            disabled
            title="Coming soon"
            onClick={() => undefined}
          />
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
                    <Store />
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
              <Empty className="border-0 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>No matching services</EmptyTitle>
                  <EmptyDescription>Try a different search term.</EmptyDescription>
                </EmptyHeader>
              </Empty>
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
                      <Pencil />
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
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit service' : 'Add service'}</DialogTitle>
              <DialogDescription>
                {isEditMode ? "Update this service's details." : 'Add a new service.'}
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
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
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => setDialogOpen(false)}
              >
                <X />
                Cancel
              </Button>
              <Button type="submit" className="gap-1.5" disabled={isPending}>
                {isEditMode ? <Check /> : <Plus />}
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
            <AlertDialogCancel className="gap-1.5">
              <X />
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/80"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash />
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
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
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
                    <Box />
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
              <Empty className="border-0 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>No matching assets</EmptyTitle>
                  <EmptyDescription>Try a different search term.</EmptyDescription>
                </EmptyHeader>
              </Empty>
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
                      <Pencil />
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
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit asset' : 'Add asset'}</DialogTitle>
              <DialogDescription>
                {isEditMode ? "Update this asset's details." : 'Add a new bookable asset.'}
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
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
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => setDialogOpen(false)}
              >
                <X />
                Cancel
              </Button>
              <Button type="submit" className="gap-1.5" disabled={isPending}>
                {isEditMode ? <Check /> : <Plus />}
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
            <AlertDialogCancel className="gap-1.5">
              <X />
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/80"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash />
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
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
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
              <Empty className="border-0 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>No matching products</EmptyTitle>
                  <EmptyDescription>Try a different search term.</EmptyDescription>
                </EmptyHeader>
              </Empty>
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
                      <Pencil />
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
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit product' : 'Add product'}</DialogTitle>
              <DialogDescription>
                {isEditMode ? "Update this product's details." : 'Add a new product.'}
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
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
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => setDialogOpen(false)}
              >
                <X />
                Cancel
              </Button>
              <Button type="submit" className="gap-1.5" disabled={isPending}>
                {isEditMode ? <Check /> : <Plus />}
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
            <AlertDialogCancel className="gap-1.5">
              <X />
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/80"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash />
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

  const dirty =
    slotInterval !== String(profile.bookingSlotIntervalMinutes) ||
    advanceWindow !== String(profile.advanceBookingWindowDays) ||
    minimumNotice !== String(profile.minimumBookingNoticeMinutes) ||
    limitOverlapping !== profile.limitOverlappingAppointments

  function handleCancel() {
    setSlotInterval(String(profile.bookingSlotIntervalMinutes))
    setAdvanceWindow(String(profile.advanceBookingWindowDays))
    setMinimumNotice(String(profile.minimumBookingNoticeMinutes))
    setLimitOverlapping(profile.limitOverlappingAppointments)
  }

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
    <div className="space-y-4">
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
        </CardContent>
      </Card>

      <UnsavedChangesBar
        show={dirty}
        saving={isPending}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  )
}

// ---------------- Knowledge Sources Tab ----------------

function knowledgeStatusLabel(status: KnowledgeSource['status']): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'indexing':
      return 'Indexing'
    case 'ready':
      return 'Ready'
    case 'failed':
      return 'Failed'
  }
}

function KnowledgeSourcesTab({ sources }: { sources: KnowledgeSource[] }) {
  const [websiteDialogOpen, setWebsiteDialogOpen] = useState(false)
  const [websiteName, setWebsiteName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [scanDepth, setScanDepth] = useState<'single' | 'quick' | 'deep'>('quick')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleUploadClick() {
    const input = document.getElementById('knowledge-file-input') as HTMLInputElement | null
    input?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.set('file', file)
    startTransition(async () => {
      const result = await uploadKnowledgeFile(formData)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('File uploaded — indexing started')
      }
      e.target.value = ''
    })
  }

  function handleAddWebsite(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const result = await addKnowledgeWebsite({
        name: websiteName,
        url: websiteUrl,
        scanDepth,
      })
      if ('error' in result) {
        setFormError(result.error)
      } else {
        toast.success('Website added — indexing started')
        setWebsiteDialogOpen(false)
        setWebsiteName('')
        setWebsiteUrl('')
        setScanDepth('quick')
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteKnowledgeSource(id)
      if ('error' in result) toast.error(result.error)
      else toast.success('Knowledge source removed')
    })
  }

  if (sources.length === 0) {
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
                Upload documents or add your website so your receptionist can answer
                business-specific questions accurately.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="grid w-full gap-2 text-left sm:grid-cols-3">
                <InfoCard title="Upload text or markdown files" />
                <InfoCard title="Crawl your website pages" />
                <InfoCard title="Searchable during live calls" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={handleUploadClick} disabled={isPending}>
                  <Upload />
                  Upload file
                </Button>
                <Button variant="outline" onClick={() => setWebsiteDialogOpen(true)} disabled={isPending}>
                  <Globe />
                  Add website
                </Button>
              </div>
            </EmptyContent>
          </Empty>
          <input
            id="knowledge-file-input"
            type="file"
            accept=".txt,.md,.markdown,.html,.htm"
            className="hidden"
            onChange={handleFileChange}
          />
        </CardContent>
        <WebsiteSourceDialog
          open={websiteDialogOpen}
          onOpenChange={setWebsiteDialogOpen}
          name={websiteName}
          url={websiteUrl}
          scanDepth={scanDepth}
          error={formError}
          isPending={isPending}
          onNameChange={setWebsiteName}
          onUrlChange={setWebsiteUrl}
          onScanDepthChange={setScanDepth}
          onSubmit={handleAddWebsite}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {sources.length} source{sources.length === 1 ? '' : 's'} indexed for call-time search
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleUploadClick} disabled={isPending}>
            <Upload />
            Upload file
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWebsiteDialogOpen(true)} disabled={isPending}>
            <Globe />
            Add website
          </Button>
        </div>
      </div>
      <input
        id="knowledge-file-input"
        type="file"
        accept=".txt,.md,.markdown,.html,.htm"
        className="hidden"
        onChange={handleFileChange}
      />
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {sources.map((source) => (
              <li key={source.id} className="flex items-center gap-3 px-4 py-3">
                {source.type === 'website' ? (
                  <Globe className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{source.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {source.type === 'website' ? source.sourceUrl : source.name}
                  </p>
                  {source.status === 'failed' && source.errorMessage && (
                    <p className="mt-1 text-xs text-destructive">{source.errorMessage}</p>
                  )}
                </div>
                <Badge
                  variant={
                    source.status === 'ready'
                      ? 'default'
                      : source.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {knowledgeStatusLabel(source.status)}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={isPending}
                  onClick={() => handleDelete(source.id)}
                >
                  <Trash />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <WebsiteSourceDialog
        open={websiteDialogOpen}
        onOpenChange={setWebsiteDialogOpen}
        name={websiteName}
        url={websiteUrl}
        scanDepth={scanDepth}
        error={formError}
        isPending={isPending}
        onNameChange={setWebsiteName}
        onUrlChange={setWebsiteUrl}
        onScanDepthChange={setScanDepth}
        onSubmit={handleAddWebsite}
      />
    </div>
  )
}

function WebsiteSourceDialog({
  open,
  onOpenChange,
  name,
  url,
  scanDepth,
  error,
  isPending,
  onNameChange,
  onUrlChange,
  onScanDepthChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  url: string
  scanDepth: 'single' | 'quick' | 'deep'
  error: string | null
  isPending: boolean
  onNameChange: (value: string) => void
  onUrlChange: (value: string) => void
  onScanDepthChange: (value: 'single' | 'quick' | 'deep') => void
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <DialogHeader>
            <DialogTitle>Add website source</DialogTitle>
            <DialogDescription>
              We&apos;ll crawl your site and index the text for your receptionist to search during
              calls.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="knowledge-website-name">Display name</Label>
                <Input
                  id="knowledge-website-name"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Company website"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="knowledge-website-url">URL</Label>
                <Input
                  id="knowledge-website-url"
                  type="url"
                  value={url}
                  onChange={(e) => onUrlChange(e.target.value)}
                  placeholder="https://example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Crawl depth</Label>
                <Select value={scanDepth} onValueChange={(v) => onScanDepthChange(v as typeof scanDepth)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single page</SelectItem>
                    <SelectItem value="quick">Quick (about 6 pages)</SelectItem>
                    <SelectItem value="deep">Deep (about 20 pages)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => onOpenChange(false)}>
              <X />
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5" disabled={isPending}>
              <Globe />
              Add website
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- FAQ Tab ----------------

function FaqTab({ faqs }: { faqs: Faq[] }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setEditingId(null)
    setQuestion('')
    setAnswer('')
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(faq: Faq) {
    setEditingId(faq.id)
    setQuestion(faq.question)
    setAnswer(faq.answer)
    setFormError(null)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const result = editingId
        ? await updateFaq({ id: editingId, question, answer })
        : await createFaq({ question, answer })
      if ('error' in result) {
        setFormError(result.error)
      } else {
        toast.success(editingId ? 'FAQ updated' : 'FAQ added')
        setDialogOpen(false)
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteFaq(id)
      if ('error' in result) toast.error(result.error)
      else toast.success('FAQ removed')
    })
  }

  if (faqs.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleQuestionMark />
              </EmptyMedia>
              <EmptyTitle>No FAQs yet</EmptyTitle>
              <EmptyDescription>
                Add common questions and answers your receptionist can search during calls.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={openCreate}>Add FAQ</Button>
            </EmptyContent>
          </Empty>
        </CardContent>
        <FaqDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          question={question}
          answer={answer}
          error={formError}
          isPending={isPending}
          isEdit={Boolean(editingId)}
          onQuestionChange={setQuestion}
          onAnswerChange={setAnswer}
          onSubmit={handleSubmit}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {faqs.length} FAQ{faqs.length === 1 ? '' : 's'} indexed for call-time search
        </p>
        <Button size="sm" onClick={openCreate} disabled={isPending}>
          <Plus />
          Add FAQ
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {faqs.map((faq) => (
              <li key={faq.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{faq.question}</p>
                    <p className="text-sm text-muted-foreground">{faq.answer}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(faq)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={isPending}
                      onClick={() => handleDelete(faq.id)}
                    >
                      <Trash />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <FaqDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        question={question}
        answer={answer}
        error={formError}
        isPending={isPending}
        isEdit={Boolean(editingId)}
        onQuestionChange={setQuestion}
        onAnswerChange={setAnswer}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

function FaqDialog({
  open,
  onOpenChange,
  question,
  answer,
  error,
  isPending,
  isEdit,
  onQuestionChange,
  onAnswerChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  question: string
  answer: string
  error: string | null
  isPending: boolean
  isEdit: boolean
  onQuestionChange: (value: string) => void
  onAnswerChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit FAQ' : 'Add FAQ'}</DialogTitle>
            <DialogDescription>
              FAQs are indexed into your knowledge base and searchable during live calls.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="faq-question">Question</Label>
                <Input
                  id="faq-question"
                  value={question}
                  onChange={(e) => onQuestionChange(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="faq-answer">Answer</Label>
                <Textarea
                  id="faq-answer"
                  value={answer}
                  onChange={(e) => onAnswerChange(e.target.value)}
                  rows={4}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => onOpenChange(false)}>
              <X />
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5" disabled={isPending}>
              {isEdit ? <Check /> : <Plus />}
              {isEdit ? 'Save changes' : 'Add FAQ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
