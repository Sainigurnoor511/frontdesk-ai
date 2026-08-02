'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Users,
  MagnifyingGlass,
  PencilSimple,
  Trash,
} from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import type { Client } from '@/lib/data/clients'
import { createClient, updateClient, deleteClient } from './actions'

type ClientFormState = {
  id?: string
  name: string
  phoneNumber: string
  email: string
  notes: string
}

const emptyForm: ClientFormState = { name: '', phoneNumber: '', email: '', notes: '' }

export function ClientsClient({ clients }: { clients: Client[] }) {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ClientFormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEditMode = Boolean(form.id)

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return clients
    return clients.filter((client) =>
      [client.name, client.phoneNumber, client.email ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    )
  }, [clients, search])

  function openAddDialog() {
    setForm(emptyForm)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(client: Client) {
    setForm({
      id: client.id,
      name: client.name,
      phoneNumber: client.phoneNumber,
      email: client.email ?? '',
      notes: client.notes ?? '',
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    startTransition(async () => {
      const result = form.id
        ? await updateClient({
            id: form.id,
            name: form.name,
            phoneNumber: form.phoneNumber,
            email: form.email,
            notes: form.notes,
          })
        : await createClient({
            name: form.name,
            phoneNumber: form.phoneNumber,
            email: form.email,
            notes: form.notes,
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
      await deleteClient(target.id)
      setDeleteTarget(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Clients</h1>
          <p className="mt-1 text-sm font-normal text-[#96989d]">
            Clients are the people who call or book with you.
          </p>
        </div>
        <Button onClick={openAddDialog}>Add client</Button>
      </div>

      <div className="relative max-w-sm">
        <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search clients"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Users className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No clients yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Clients you add, or promote from a conversation, will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {filteredClients.map((client) => (
                <li
                  key={client.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium">{client.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {client.phoneNumber}
                      {client.email ? ` · ${client.email}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${client.name}`}
                      onClick={() => openEditDialog(client)}
                    >
                      <PencilSimple />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${client.name}`}
                      onClick={() => setDeleteTarget(client)}
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
              <DialogTitle>{isEditMode ? 'Edit client' : 'Add client'}</DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? "Update this client's details."
                  : 'Add a new client to your organization.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="client-name" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="client-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="client-phone" className="text-sm font-medium">
                  Phone Number
                </label>
                <Input
                  id="client-phone"
                  value={form.phoneNumber}
                  onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                  placeholder="+14155551234"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="client-email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="client-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="client-notes" className="text-sm font-medium">
                  Notes
                </label>
                <Textarea
                  id="client-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
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
                {isEditMode ? 'Save changes' : 'Add client'}
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
              This removes the client record permanently. This can&apos;t be undone.
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
