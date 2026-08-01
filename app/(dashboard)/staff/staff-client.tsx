'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  UserGear,
  MagnifyingGlass,
  PencilSimple,
  Trash,
} from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import type { StaffMember } from '@/lib/data/staff'
import { createStaffMember, updateStaffMember, deleteStaffMember } from './actions'

type StaffFormState = {
  id?: string
  fullName: string
  displayName: string
  description: string
  email: string
  phone: string
  isActive: boolean
  showOnBookingPage: boolean
}

const emptyForm: StaffFormState = {
  fullName: '',
  displayName: '',
  description: '',
  email: '',
  phone: '',
  isActive: true,
  showOnBookingPage: true,
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '')
  return initials.join('') || '?'
}

export function StaffClient({ staff }: { staff: StaffMember[] }) {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<StaffFormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null)
  const [isPending, startTransition] = useTransition()

  // TODO: "Available now" / "In session" filters are UI-only for now — there's
  // no real-time presence system yet to back them with live staff status.
  const [presenceFilter, setPresenceFilter] = useState<'available' | 'in-session' | null>(
    null
  )

  const isEditMode = Boolean(form.id)

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return staff
    return staff.filter((member) =>
      [member.fullName, member.displayName ?? '', member.email ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    )
  }, [staff, search])

  function openAddDialog() {
    setForm(emptyForm)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(member: StaffMember) {
    setForm({
      id: member.id,
      fullName: member.fullName,
      displayName: member.displayName ?? '',
      description: member.description ?? '',
      email: member.email ?? '',
      phone: member.phone ?? '',
      isActive: member.isActive,
      showOnBookingPage: member.showOnBookingPage,
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    startTransition(async () => {
      const result = form.id
        ? await updateStaffMember({
            id: form.id,
            fullName: form.fullName,
            displayName: form.displayName,
            description: form.description,
            email: form.email,
            phone: form.phone,
            isActive: form.isActive,
            showOnBookingPage: form.showOnBookingPage,
          })
        : await createStaffMember({
            fullName: form.fullName,
            displayName: form.displayName,
            description: form.description,
            email: form.email,
            phone: form.phone,
            isActive: form.isActive,
            showOnBookingPage: form.showOnBookingPage,
          })

      if ('error' in result) {
        setFormError(result.error)
        return
      }

      setDialogOpen(false)
      setForm(emptyForm)
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget

    startTransition(async () => {
      await deleteStaffMember(target.id)
      setDeleteTarget(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="text-muted-foreground">
            The people who deliver your services. Your receptionist books the right
            one based on their hours and skills.
          </p>
        </div>
        <Button onClick={openAddDialog}>Add staff member</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search staff"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant={presenceFilter === 'available' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() =>
            setPresenceFilter((current) => (current === 'available' ? null : 'available'))
          }
        >
          Available now
        </Button>
        <Button
          type="button"
          variant={presenceFilter === 'in-session' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() =>
            setPresenceFilter((current) => (current === 'in-session' ? null : 'in-session'))
          }
        >
          In session
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredStaff.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <UserGear className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No staff yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Staff are the people who deliver your services. Add your team so
                your receptionist can book the right person.
              </p>
              <Button onClick={openAddDialog} className="mt-2">
                Add staff
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {filteredStaff.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{getInitials(member.fullName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium">{member.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {member.displayName || member.email || ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${member.fullName}`}
                      onClick={() => openEditDialog(member)}
                    >
                      <PencilSimple />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${member.fullName}`}
                      onClick={() => setDeleteTarget(member)}
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
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {isEditMode ? 'Edit staff member' : 'Add staff member'}
              </DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? "Update this staff member's details."
                  : 'Add a new staff member to your organization.'}
              </DialogDescription>
            </DialogHeader>

            {/* Working hours and Services sub-tabs are deferred — they depend on
                per-staff Availability and a Services table that don't exist yet. */}
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Basic info</h3>

                <div className="space-y-1.5">
                  <label htmlFor="staff-full-name" className="text-sm font-medium">
                    Full Name
                  </label>
                  <Input
                    id="staff-full-name"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="staff-display-name" className="text-sm font-medium">
                    Display name
                  </label>
                  <Input
                    id="staff-display-name"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="staff-description" className="text-sm font-medium">
                    Description
                  </label>
                  <Textarea
                    id="staff-description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="e.g., 10 years of experience specializing in..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="staff-email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="staff-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="staff-phone" className="text-sm font-medium">
                    Phone
                  </label>
                  <Input
                    id="staff-phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="staff-is-active"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, isActive: checked === true })
                    }
                  />
                  <label htmlFor="staff-is-active" className="text-sm font-medium">
                    Active (available for bookings)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="staff-show-on-booking-page"
                    checked={form.showOnBookingPage}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, showOnBookingPage: checked === true })
                    }
                  />
                  <label
                    htmlFor="staff-show-on-booking-page"
                    className="text-sm font-medium"
                  >
                    Display on public booking page
                  </label>
                </div>
              </div>

              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isEditMode ? 'Save changes' : 'Add staff member'}
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
            <AlertDialogTitle>Delete {deleteTarget?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the staff member record permanently. This can&apos;t be
              undone.
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
