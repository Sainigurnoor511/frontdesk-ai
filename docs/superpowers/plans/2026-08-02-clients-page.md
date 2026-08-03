# Clients Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/clients` placeholder page with a real `clients` database table and full CRUD UI (list, search, add, edit, delete).

**Architecture:** A new `clients` Postgres table (via Supabase migration) with RLS scoped to `organization_id`, following the exact pattern of the existing `agents` table. Server actions in `app/(dashboard)/clients/actions.ts` handle create/update/delete with Zod validation and org-scoped lookups. The page itself renders client-side (list + search filter + Dialog-based add/edit form + AlertDialog delete confirm), fetching the list once server-side and passing it down.

**Tech Stack:** Next.js 16 Server Components + Server Actions, Supabase (Postgres + RLS), Zod, `@base-ui/react` Dialog/AlertDialog (already vendored), Vitest.

## Global Constraints

- `organization_id` scoping on every table, RLS policy pattern must match `supabase/migrations/00000000000003_agents_and_scan_jobs.sql` exactly (select/insert/update using `organization_id in (select organization_id from members where user_id = auth.uid())`).
- Server actions must look up the org via `supabase.auth.getUser()` then `.eq('user_id', user.id)` on `members` — never trust a client-supplied org id (matches the fix already applied to `createAgent`).
- No billing/paywall gating — this is free/open source.
- Icons from `@phosphor-icons/react/dist/ssr` only (project has migrated off lucide-react for app code).
- Use the existing `Dialog` / `AlertDialog` components from `components/ui/`, not new modal implementations.

---

### Task 1: `clients` table migration

**Files:**
- Create: `supabase/migrations/00000000000004_clients.sql`

**Interfaces:**
- Produces: `clients` table with columns `id, organization_id, name, phone_number, email, notes, created_at, updated_at`, consumed by Task 2's server actions.

- [ ] **Step 1: Write the migration**

```sql
create table clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  phone_number text not null,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table clients enable row level security;

create policy "Members can view their organization's clients"
  on clients for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can create clients in their organization"
  on clients for insert
  with check (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can update their organization's clients"
  on clients for update
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

create policy "Members can delete their organization's clients"
  on clients for delete
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: migration `00000000000004_clients` applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00000000000004_clients.sql
git commit -m "Add clients table with org-scoped RLS policies"
```

---

### Task 2: Client validation schema

**Files:**
- Create: `lib/validations/client.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createClientSchema`, `updateClientSchema`, `type CreateClientInput`, `type UpdateClientInput`, consumed by Task 3's server actions and Task 5's form.

- [ ] **Step 1: Write the schema**

```typescript
import { z } from 'zod'

export const createClientSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
})
export type CreateClientInput = z.infer<typeof createClientSchema>

export const updateClientSchema = createClientSchema.extend({
  id: z.string().uuid(),
})
export type UpdateClientInput = z.infer<typeof updateClientSchema>
```

- [ ] **Step 2: Commit**

```bash
git add lib/validations/client.ts
git commit -m "Add client validation schemas"
```

---

### Task 3: Client server actions

**Files:**
- Create: `app/(dashboard)/clients/actions.ts`
- Test: `app/(dashboard)/clients/actions.test.ts`

**Interfaces:**
- Consumes: `createClientSchema`, `updateClientSchema`, `CreateClientInput`, `UpdateClientInput` from `lib/validations/client.ts` (Task 2); `createClient` from `@/lib/supabase/server`.
- Produces: `createClient(input: CreateClientInput): Promise<{ error: string } | { success: true }>`, `updateClient(input: UpdateClientInput): Promise<{ error: string } | { success: true }>`, `deleteClient(id: string): Promise<{ error: string } | { success: true }>`. All revalidate `/clients` on success. Consumed by Task 5 (form) and Task 6 (delete confirm).

Note: name the exported function `createClientAction` etc. is unnecessary — but this file's `createClient` action would collide by name with the imported Supabase `createClient`. Import the Supabase client factory under an alias.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient as createClientAction, updateClient, deleteClient } from './actions'

const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq, single: mockSingle }))
const mockInsert = vi.fn(() => ({ select: mockSelect }))
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))
const mockUpdateEq = vi.fn(() => ({ eq: mockUpdateEq2, select: mockSelect }))
const mockUpdateEq2 = vi.fn(() => ({ select: mockSelect }))
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq }))
const mockDeleteEq = vi.fn(() => ({ eq: mockDeleteEq2 }))
const mockDeleteEq2 = vi.fn(() => Promise.resolve({ error: null }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'members') {
    return { select: () => ({ eq: () => ({ single: mockSingle }) }) }
  }
  return {
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  }
})

const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createClient action', () => {
  it('returns a validation error for an invalid phone number', async () => {
    const result = await createClientAction({ name: 'Jane', phoneNumber: 'not-a-phone' })
    expect(result).toEqual({ error: 'Enter a valid phone number' })
  })

  it('returns an error when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await createClientAction({ name: 'Jane', phoneNumber: '+14155551234' })
    expect(result).toEqual({ error: 'You must be signed in to add a client.' })
  })

  it('creates a client scoped to the caller organization', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSingle.mockResolvedValueOnce({ data: { organization_id: 'org-1' } })
    mockSingle.mockResolvedValueOnce({ data: { id: 'client-1' }, error: null })

    const result = await createClientAction({ name: 'Jane', phoneNumber: '+14155551234' })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: 'org-1', name: 'Jane', phone_number: '+14155551234' })
    )
    expect(result).toEqual({ success: true })
  })
})

describe('deleteClient action', () => {
  it('scopes the delete to the caller organization', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSingle.mockResolvedValueOnce({ data: { organization_id: 'org-1' } })

    const result = await deleteClient('client-1')

    expect(mockDelete).toHaveBeenCalled()
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'client-1')
    expect(mockDeleteEq2).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(result).toEqual({ success: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/\(dashboard\)/clients/actions.test.ts`
Expected: FAIL with "Cannot find module './actions'"

- [ ] **Step 3: Write the implementation**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import {
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type UpdateClientInput,
} from '@/lib/validations/client'

async function getCallerOrgId(): Promise<{ orgId: string } | { error: string }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to add a client.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  return { orgId: member.organization_id }
}

export async function createClient(
  input: CreateClientInput
): Promise<{ error: string } | { success: true }> {
  const parsed = createClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const org = await getCallerOrgId()
  if ('error' in org) return org

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from('clients')
    .insert({
      organization_id: org.orgId,
      name: parsed.data.name,
      phone_number: parsed.data.phoneNumber,
      email: parsed.data.email || null,
      notes: parsed.data.notes || null,
    })
    .select('id')
    .single()

  if (error) {
    return { error: 'Could not add client. Please try again.' }
  }

  revalidatePath('/clients')
  return { success: true }
}

export async function updateClient(
  input: UpdateClientInput
): Promise<{ error: string } | { success: true }> {
  const parsed = updateClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const org = await getCallerOrgId()
  if ('error' in org) return org

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from('clients')
    .update({
      name: parsed.data.name,
      phone_number: parsed.data.phoneNumber,
      email: parsed.data.email || null,
      notes: parsed.data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id)
    .eq('organization_id', org.orgId)

  if (error) {
    return { error: 'Could not update client. Please try again.' }
  }

  revalidatePath('/clients')
  return { success: true }
}

export async function deleteClient(id: string): Promise<{ error: string } | { success: true }> {
  const org = await getCallerOrgId()
  if ('error' in org) return org

  const supabase = await createSupabaseClient()
  const { error } = await supabase.from('clients').delete().eq('id', id).eq('organization_id', org.orgId)

  if (error) {
    return { error: 'Could not delete client. Please try again.' }
  }

  revalidatePath('/clients')
  return { success: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/\(dashboard\)/clients/actions.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/clients/actions.ts" "app/(dashboard)/clients/actions.test.ts"
git commit -m "Add client server actions with org-scoped CRUD"
```

---

### Task 4: Client data fetch helper

**Files:**
- Create: `lib/data/clients.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`.
- Produces: `type Client = { id: string; name: string; phoneNumber: string; email: string | null; notes: string | null; createdAt: string }`, `getClientsForOrg(): Promise<Client[]>`. Consumed by Task 7 (page).

- [ ] **Step 1: Write the implementation**

```typescript
import { createClient } from '@/lib/supabase/server'

export type Client = {
  id: string
  name: string
  phoneNumber: string
  email: string | null
  notes: string | null
  createdAt: string
}

export async function getClientsForOrg(): Promise<Client[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) return []

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, phone_number, email, notes, created_at')
    .eq('organization_id', member.organization_id)
    .order('created_at', { ascending: false })

  if (!clients) return []

  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    phoneNumber: c.phone_number,
    email: c.email,
    notes: c.notes,
    createdAt: c.created_at,
  }))
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: compiles with no type errors (file is not yet imported anywhere, so this just checks syntax/types in isolation).

- [ ] **Step 3: Commit**

```bash
git add lib/data/clients.ts
git commit -m "Add client data fetch helper"
```

---

### Task 5: Client form dialog

**Files:**
- Create: `components/clients/client-form-dialog.tsx`

**Interfaces:**
- Consumes: `createClient`, `updateClient` from `app/(dashboard)/clients/actions.ts` (Task 3); `Client` type from `lib/data/clients.ts` (Task 4); `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog`; `Input`, `Textarea`, `Button`, `Label` from `@/components/ui/`.
- Produces: `ClientFormDialog` component with props `{ open: boolean; onOpenChange: (open: boolean) => void; client?: Client }` (omit `client` for add mode, pass it for edit mode). Consumed by Task 7 (page).

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { createClient, updateClient } from '@/app/(dashboard)/clients/actions'
import type { Client } from '@/lib/data/clients'

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: Client
}) {
  const isEdit = client !== undefined
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName(client?.name ?? '')
      setPhoneNumber(client?.phoneNumber ?? '')
      setEmail(client?.email ?? '')
      setNotes(client?.notes ?? '')
      setError(null)
    }
  }, [open, client])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const result = isEdit
      ? await updateClient({ id: client.id, name, phoneNumber, email, notes })
      : await createClient({ name, phoneNumber, email, notes })

    setSubmitting(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    toast.success(isEdit ? 'Client updated' : 'Client added')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit client' : 'Add client'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this client’s contact information.'
              : 'Add a client to your client base.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Name</Label>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-phone">Phone number</Label>
            <Input
              id="client-phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+14155551234"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea
              id="client-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about this client..."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {isEdit ? 'Save changes' : 'Add client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: compiles with no type errors. If `Label` or `Textarea` don't exist at `@/components/ui/label` / `@/components/ui/textarea`, check `components/ui/` first (they were listed as already vendored in this project's UI scaffold) — do not recreate them.

- [ ] **Step 3: Commit**

```bash
git add components/clients/client-form-dialog.tsx
git commit -m "Add client add/edit form dialog"
```

---

### Task 6: Delete confirmation

**Files:**
- Create: `components/clients/delete-client-dialog.tsx`

**Interfaces:**
- Consumes: `deleteClient` from `app/(dashboard)/clients/actions.ts` (Task 3); `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel` from `@/components/ui/alert-dialog`.
- Produces: `DeleteClientDialog` component with props `{ open: boolean; onOpenChange: (open: boolean) => void; clientId: string; clientName: string }`. Consumed by Task 7 (page).

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
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
import { deleteClient } from '@/app/(dashboard)/clients/actions'

export function DeleteClientDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteClient(clientId)
    setDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    toast.success('Client deleted')
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {clientName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the client record permanently. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleting}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: compiles with no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/clients/delete-client-dialog.tsx
git commit -m "Add client delete confirmation dialog"
```

---

### Task 7: Clients list page

**Files:**
- Modify: `app/(dashboard)/clients/page.tsx` (currently a `PlaceholderPage`)
- Create: `app/(dashboard)/clients/clients-client.tsx`

**Interfaces:**
- Consumes: `getClientsForOrg`, `type Client` from `lib/data/clients.ts` (Task 4); `ClientFormDialog` from `components/clients/client-form-dialog.tsx` (Task 5); `DeleteClientDialog` from `components/clients/delete-client-dialog.tsx` (Task 6).
- Produces: the rendered `/clients` route. Terminal task — nothing downstream consumes this.

- [ ] **Step 1: Rewrite the page as a server wrapper**

Replace the full contents of `app/(dashboard)/clients/page.tsx`:

```tsx
import { getClientsForOrg } from '@/lib/data/clients'
import { ClientsClient } from './clients-client'

export default async function ClientsPage() {
  const clients = await getClientsForOrg()
  return <ClientsClient initialClients={clients} />
}
```

- [ ] **Step 2: Write the client component**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { MagnifyingGlass, Plus, PencilSimple, Trash, UsersThree } from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ClientFormDialog } from '@/components/clients/client-form-dialog'
import { DeleteClientDialog } from '@/components/clients/delete-client-dialog'
import type { Client } from '@/lib/data/clients'

export function ClientsClient({ initialClients }: { initialClients: Client[] }) {
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [deleteClient, setDeleteClient] = useState<Client | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return initialClients
    return initialClients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phoneNumber.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false)
    )
  }, [initialClients, search])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-muted-foreground">
            The people who call or book with you.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus />
          Add client
        </Button>
      </div>

      <div className="relative max-w-sm">
        <MagnifyingGlass className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <UsersThree className="size-8 text-muted-foreground" />
            <p className="font-medium">{initialClients.length === 0 ? 'No clients yet' : 'No matches'}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {initialClients.length === 0
                ? 'Clients you add, or promote from a conversation, will show up here.'
                : 'Try a different search.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {filtered.map((client) => (
              <div key={client.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {client.phoneNumber}
                    {client.email ? ` · ${client.email}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditClient(client)}>
                    <PencilSimple />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete"
                    onClick={() => setDeleteClient(client)}
                  >
                    <Trash />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ClientFormDialog open={addOpen} onOpenChange={setAddOpen} />

      {editClient && (
        <ClientFormDialog
          open={editClient !== null}
          onOpenChange={(open) => !open && setEditClient(null)}
          client={editClient}
        />
      )}

      {deleteClient && (
        <DeleteClientDialog
          open={deleteClient !== null}
          onOpenChange={(open) => !open && setDeleteClient(null)}
          clientId={deleteClient.id}
          clientName={deleteClient.name}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run the full verification loop**

Run: `npm run build`
Expected: compiles clean, `/clients` route listed as dynamic (`ƒ`).

Run: `npm test`
Expected: all tests pass including the new `actions.test.ts` from Task 3.

Run: `npm run lint`
Expected: no new errors introduced in files touched by this plan (pre-existing errors in unrelated files, e.g. `lib/crawler/crawl.ts`, are out of scope).

- [ ] **Step 4: Live-verify in the browser**

Start the dev server if not already running (`npm run dev`), then using Chrome DevTools MCP tools:
1. Navigate to `http://localhost:3000/clients`.
2. Call `list_console_messages` filtered to `["error", "warn"]` — expect only the known harmless `THREE.Clock` deprecation warning, no new errors.
3. Take a screenshot, confirm the empty state renders ("No clients yet").
4. Click "Add client", fill in Name + Phone number, submit. Confirm the dialog closes and the new client appears in the list.
5. Click the edit (pencil) icon on that client, change the name, save. Confirm the list updates.
6. Click the delete (trash) icon, confirm in the AlertDialog. Confirm the client is removed and the empty state returns.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/clients/page.tsx" "app/(dashboard)/clients/clients-client.tsx"
git commit -m "Build Clients list page with search, add, edit, and delete"
```

---

## Self-Review Notes

- **Spec coverage:** `clients` table + RLS (Task 1) ✓, list page with search (Task 7) ✓, add/edit dialog with Name/Phone/Email/Notes (Task 5) ✓, delete (Task 6) ✓, empty state (Task 7) ✓, server action validation + org-scoping tests (Task 3) ✓. Date-range filters and client detail sub-page are explicitly out of scope per the spec — no task needed.
- **Type consistency:** `Client` type defined once in Task 4 (`lib/data/clients.ts`) and imported everywhere downstream (Tasks 5, 6, 7) rather than redefined. `CreateClientInput`/`UpdateClientInput` defined once in Task 2 and imported by Task 3 and reused implicitly by Task 5's inline form state (Task 5 doesn't re-import the Zod types since it builds plain objects matching the action's parameter shape by name).
- **Placeholder scan:** no TBDs; every step has real code. Task 5's Step 2 has a conditional note ("if Label/Textarea don't exist, check first") — this is guidance about verifying an assumption against the existing vendored UI scaffold, not a placeholder for unwritten code.
