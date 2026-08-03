# Auth + Organizations + Dashboard Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship email/password + Google OAuth signup/login, auto-created org+membership on signup, org-scoped RLS, and the full shadcn dashboard shell (sidebar/header/nav) with placeholder pages, per `docs/superpowers/specs/2026-08-01-auth-orgs-dashboard-shell-design.md`.

**Architecture:** Next.js 16 App Router, route groups `(auth)` public / `(dashboard)` protected. Supabase (hosted cloud project) for auth + Postgres via `@supabase/ssr`. Org creation happens server-side through a service-role client inside a server action, never client-side, to satisfy RLS. Dashboard layout is a Server Component fetching session+org once, no client fetch waterfall.

**Tech Stack:** Next.js 16, TypeScript, `@supabase/ssr` + `@supabase/supabase-js`, Zod, React Hook Form, shadcn/ui (already vendored in `components/ui/`), Tailwind, Vitest (unit), Playwright (smoke e2e).

## Global Constraints

- Light mode only (v1). No custom CSS, no shadcn style overrides, no custom colors/radii/shadows/spacing/typography. Tailwind utilities for layout only. Lucide icons only.
- Route Handlers: `context.params` is a `Promise` — always `await params`. `GET` handlers are dynamic by default.
- Every table scoped by `organization_id`; RLS enforced, never bypassed except inside server-only service-role code paths explicitly documented here.
- Server actions return `{ error: string } | never` (redirect on success) — never throw raw Supabase errors to the client.
- Design skills installed at `.agents/skills/`: `design-taste-frontend`, `redesign-existing-projects`, `image-to-code`, `minimalist-ui`. Every UI task must apply `design-taste-frontend` (and `minimalist-ui` for layout/spacing calls) — target is an Apple/ElevenLabs-level production feel, not default-template look, while staying inside the "use only shadcn, no custom CSS" constraint (achieve polish through composition, spacing rhythm, copy, and shadcn's built-in variants — not bespoke CSS).
- This machine has no Docker/local Supabase — uses a **hosted Supabase cloud project**. Env vars required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GOOGLE_OAUTH_CLIENT_ID`/`SECRET` (configured in Supabase dashboard, not app env). User has not yet provided these — tasks requiring them are marked **BLOCKED: needs Supabase credentials** and must pause for user input rather than fabricating values.

---

### Task 1: Project dependencies and env scaffolding

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `proxy.ts`

**Interfaces:**
- Produces: `createClient()` in `lib/supabase/client.ts` (browser client, no args, returns `SupabaseClient`). `createClient()` in `lib/supabase/server.ts` (async, awaits `cookies()`, returns `SupabaseClient`). `createServiceRoleClient()` in `lib/supabase/server.ts` (sync, returns `SupabaseClient` using `SUPABASE_SECRET_KEY`, server-only — throws if imported in a client component via `import 'server-only'`). `updateSession(request: NextRequest)` in `lib/supabase/middleware.ts` (returns `NextResponse`).

- [ ] **Step 1: Install dependencies**

Run: `npm install @supabase/ssr @supabase/supabase-js zod react-hook-form @hookform/resolvers server-only`
Run: `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @playwright/test`

- [ ] **Step 2: Create `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

- [ ] **Step 3: Create browser Supabase client**

`lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

- [ ] **Step 4: Create server Supabase clients**

`lib/supabase/server.ts`:
```ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // called from a Server Component; middleware refreshes sessions instead
          }
        },
      },
    }
  )
}

export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 5: Create middleware session refresh helper**

`lib/supabase/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()

  return supabaseResponse
}
```

- [ ] **Step 6: Create root proxy file**

Next.js 16 renamed the `middleware` file convention to `proxy` (file `middleware.ts` is deprecated — verified against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). The file must be named `proxy.ts` and export a function named `proxy`, not `middleware`.

`proxy.ts`:
```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 7: Verify build compiles**

Run: `npm run build`
Expected: build fails or warns only about missing env vars at runtime — no TypeScript/module errors. If it fails on missing env vars during static analysis, add placeholder values to `.env.local` (gitignored) temporarily: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder`, `SUPABASE_SECRET_KEY=placeholder`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example lib/supabase proxy.ts
git commit -m "feat: add Supabase SSR client scaffolding"
```

---

### Task 2: Database schema and RLS migration (BLOCKED: needs Supabase credentials)

**Files:**
- Create: `supabase/migrations/00000000000001_organizations_members.sql`

**Interfaces:**
- Produces: `organizations(id, name, created_at)`, `members(id, organization_id, user_id, role, created_at)` tables, both with RLS enabled, consumed by every later task's queries.

**BLOCKED:** Applying this migration to a live database requires a Supabase cloud project. Ask user: "Please provide your Supabase project URL, anon key, and service role key (Project Settings → API in the Supabase dashboard) so I can apply the schema migration." Do not fabricate a project. Once credentials are in `.env.local`, proceed.

- [ ] **Step 1: Write migration SQL**

`supabase/migrations/00000000000001_organizations_members.sql`:
```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table organizations enable row level security;
alter table members enable row level security;

create policy "Members can view their organization"
  on organizations for select
  using (
    exists (
      select 1 from members
      where members.organization_id = organizations.id
      and members.user_id = auth.uid()
    )
  );

create policy "Owners can update their organization"
  on organizations for update
  using (
    exists (
      select 1 from members
      where members.organization_id = organizations.id
      and members.user_id = auth.uid()
      and members.role = 'owner'
    )
  );

create policy "Members can view their own membership rows"
  on members for select
  using (
    organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );
```

Note: no INSERT/UPDATE policy is defined for `members` for the `authenticated` role — by default, RLS denies all access not explicitly granted, so inserts/updates are only possible via the service-role client (which bypasses RLS entirely), matching the spec.

- [ ] **Step 2: Apply migration via Supabase CLI against the hosted project**

Run: `npx supabase login` (opens browser auth)
Run: `npx supabase link --project-ref <project-ref-from-dashboard-url>`
Run: `npx supabase db push`
Expected: migration applies cleanly, `organizations` and `members` tables visible in Supabase dashboard Table Editor.

- [ ] **Step 3: Manually verify RLS in Supabase SQL editor**

Run in Supabase dashboard SQL editor: `select * from organizations;` while impersonating an anon/no-session context (or just confirm via dashboard's RLS testing tool) — expect zero rows returned without a matching `members` row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add organizations and members schema with RLS"
```

---

### Task 3: Zod schemas for auth and org forms

**Files:**
- Create: `lib/validations/auth.ts`
- Create: `lib/validations/organization.ts`
- Test: `lib/validations/auth.test.ts`
- Test: `lib/validations/organization.test.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `signupSchema` (Zod object: `email: string().email()`, `password: string().min(8)`, `businessName: string().min(1).max(200)`), `loginSchema` (`email`, `password`), `SignupInput`/`LoginInput` inferred types — exported from `lib/validations/auth.ts`. `organizationNameSchema` (`name: string().min(1).max(200)`), `OrganizationNameInput` type — exported from `lib/validations/organization.ts`.

- [ ] **Step 1: Create Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 2: Write failing test for auth schemas**

`lib/validations/auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { signupSchema, loginSchema } from './auth'

describe('signupSchema', () => {
  it('accepts valid signup input', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      businessName: 'Acme Dental',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = signupSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
      businessName: 'Acme Dental',
    })
    expect(result.success).toBe(false)
  })

  it('rejects short password', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'short',
      businessName: 'Acme Dental',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty business name', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      businessName: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('accepts valid login input', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'anything',
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/validations/auth.test.ts`
Expected: FAIL — `./auth` module not found.

- [ ] **Step 4: Implement auth schemas**

`lib/validations/auth.ts`:
```ts
import { z } from 'zod'

export const signupSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  businessName: z.string().min(1, 'Business name is required').max(200),
})

export type SignupInput = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export type LoginInput = z.infer<typeof loginSchema>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/validations/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Write and implement organization schema (same cycle)**

`lib/validations/organization.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { organizationNameSchema } from './organization'

describe('organizationNameSchema', () => {
  it('accepts a valid name', () => {
    expect(organizationNameSchema.safeParse({ name: 'Acme Dental' }).success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(organizationNameSchema.safeParse({ name: '' }).success).toBe(false)
  })
})
```

`lib/validations/organization.ts`:
```ts
import { z } from 'zod'

export const organizationNameSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(200),
})

export type OrganizationNameInput = z.infer<typeof organizationNameSchema>
```

Run: `npm test -- lib/validations/organization.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/validations vitest.config.ts package.json package-lock.json
git commit -m "feat: add Zod validation schemas for auth and organization forms"
```

---

### Task 4: Signup server action with org auto-creation

**Files:**
- Create: `app/(auth)/actions.ts`
- Test: `app/(auth)/actions.test.ts`

**Interfaces:**
- Consumes: `signupSchema`, `loginSchema` from `lib/validations/auth.ts`; `createClient()`, `createServiceRoleClient()` from `lib/supabase/server.ts`.
- Produces: `signUp(input: SignupInput): Promise<{ error: string } | never>` (redirects to `/` on success — via `redirect()` from `next/navigation`, which throws internally so the return type is effectively `{ error: string }` on failure paths only). `logIn(input: LoginInput): Promise<{ error: string } | never>`. `logOut(): Promise<never>`. All exported as `'use server'` actions.

- [ ] **Step 1: Write failing test for signup validation failure path**

`app/(auth)/actions.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { signUp } from './actions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

describe('signUp', () => {
  it('returns validation error for invalid email', async () => {
    const result = await signUp({
      email: 'not-an-email',
      password: 'password123',
      businessName: 'Acme',
    })
    expect(result).toEqual({ error: 'Enter a valid email address' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/\(auth\)/actions.test.ts`
Expected: FAIL — `./actions` module not found.

- [ ] **Step 3: Implement server actions**

`app/(auth)/actions.ts`:
```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { signupSchema, loginSchema, type SignupInput, type LoginInput } from '@/lib/validations/auth'

function friendlyAuthError(message: string): string {
  if (message.includes('already registered')) {
    return 'An account with this email already exists.'
  }
  if (message.includes('Invalid login credentials')) {
    return 'Incorrect email or password.'
  }
  return 'Something went wrong. Please try again.'
}

export async function signUp(input: SignupInput): Promise<{ error: string }> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { error: friendlyAuthError(error.message) }
  }
  if (!data.user) {
    return { error: 'Something went wrong. Please try again.' }
  }

  const serviceClient = createServiceRoleClient()
  const { data: org, error: orgError } = await serviceClient
    .from('organizations')
    .insert({ name: parsed.data.businessName })
    .select('id')
    .single()

  if (orgError || !org) {
    return { error: 'Account created but organization setup failed. Contact support.' }
  }

  const { error: memberError } = await serviceClient
    .from('members')
    .insert({ organization_id: org.id, user_id: data.user.id, role: 'owner' })

  if (memberError) {
    return { error: 'Account created but organization setup failed. Contact support.' }
  }

  redirect('/')
}

export async function logIn(input: LoginInput): Promise<{ error: string }> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { error: friendlyAuthError(error.message) }
  }

  redirect('/')
}

export async function logOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function signInWithGoogle(): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/callback`,
    },
  })

  if (error) {
    return { error: friendlyAuthError(error.message) }
  }
  if (data.url) {
    redirect(data.url)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/\(auth\)/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `NEXT_PUBLIC_SITE_URL` to `.env.example`**

Append to `.env.example`: `NEXT_PUBLIC_SITE_URL=http://localhost:3000`

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/actions.ts" "app/(auth)/actions.test.ts" .env.example
git commit -m "feat: add signup, login, logout, and Google OAuth server actions"
```

---

### Task 5: OAuth callback route

**Files:**
- Create: `app/(auth)/callback/route.ts`

**Interfaces:**
- Consumes: `createClient()`, `createServiceRoleClient()` from `lib/supabase/server.ts`.
- Produces: `GET` handler at `/callback` that exchanges the OAuth code, creates org+membership if this is the user's first login (no existing `members` row), then redirects to `/`.

- [ ] **Step 1: Implement callback route**

`app/(auth)/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
  }

  const serviceClient = createServiceRoleClient()
  const { data: existingMember } = await serviceClient
    .from('members')
    .select('id')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (!existingMember) {
    const businessName = data.user.email?.split('@')[0] ?? 'My Business'
    const { data: org, error: orgError } = await serviceClient
      .from('organizations')
      .insert({ name: businessName })
      .select('id')
      .single()

    if (orgError || !org) {
      return NextResponse.redirect(`${origin}/login?error=org_setup_failed`)
    }

    await serviceClient
      .from('members')
      .insert({ organization_id: org.id, user_id: data.user.id, role: 'owner' })
  }

  return NextResponse.redirect(`${origin}/`)
}
```

- [ ] **Step 2: Manual verification note**

This route can't be unit-tested meaningfully (it's a thin OAuth glue layer) — it's covered by the Playwright Google OAuth smoke path deferred to manual QA in Task 10 (Google OAuth requires real browser consent flow, not automatable without a test Google account).

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/callback/route.ts"
git commit -m "feat: add OAuth callback route with first-login org creation"
```

---

### Task 6: Login and signup pages

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`
- Create: `components/auth/login-form.tsx`
- Create: `components/auth/signup-form.tsx`
- Create: `components/auth/google-button.tsx`

**Interfaces:**
- Consumes: `signUp`, `logIn`, `signInWithGoogle` from `app/(auth)/actions.ts`; `signupSchema`, `loginSchema` from `lib/validations/auth.ts`; shadcn `Card`, `Button`, `Input`, `Label`, `Field` from `components/ui/`.
- Produces: pages at `/login`, `/signup`, reusable `<LoginForm />`, `<SignupForm />`, `<GoogleButton />` client components.

- [ ] **Step 1: Apply design-taste-frontend skill before building**

Invoke the `design-taste-frontend` skill (and reference `minimalist-ui`) to determine layout, copy tone, and spacing for the auth screens before writing JSX — target: centered card, generous whitespace, no default-template look, using only shadcn primitives (Card, Field, Input, Button) and Tailwind layout utilities. Do not add custom CSS or colors.

- [ ] **Step 2: Create auth layout**

`app/(auth)/layout.tsx`:
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
```

- [ ] **Step 3: Create GoogleButton**

`components/auth/google-button.tsx`:
```tsx
'use client'

import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/app/(auth)/actions'
import { useTransition } from 'react'
import { toast } from 'sonner'

export function GoogleButton() {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await signInWithGoogle()
      if (result?.error) {
        toast.error(result.error)
      }
    })
  }

  return (
    <Button variant="outline" className="w-full" onClick={handleClick} disabled={isPending}>
      Continue with Google
    </Button>
  )
}
```

- [ ] **Step 4: Create SignupForm**

`components/auth/signup-form.tsx`:
```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signupSchema, type SignupInput } from '@/lib/validations/auth'
import { signUp } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export function SignupForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) })

  async function onSubmit(input: SignupInput) {
    const result = await signUp(input)
    if (result?.error) {
      toast.error(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input id="businessName" {...register('businessName')} />
        {errors.businessName && (
          <p className="text-sm text-destructive">{errors.businessName.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" {...register('password')} />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 5: Create LoginForm**

`components/auth/login-form.tsx`:
```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { logIn } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(input: LoginInput) {
    const result = await logIn(input)
    if (result?.error) {
      toast.error(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" {...register('password')} />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 6: Create signup and login pages**

`app/(auth)/signup/page.tsx`:
```tsx
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { SignupForm } from '@/components/auth/signup-form'
import { GoogleButton } from '@/components/auth/google-button'

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Set up your AI receptionist in minutes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleButton />
        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

`app/(auth)/login/page.tsx`:
```tsx
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { LoginForm } from '@/components/auth/login-form'
import { GoogleButton } from '@/components/auth/google-button'

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your FrontDesk.ai dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleButton />
        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add "app/(auth)" components/auth
git commit -m "feat: add login and signup pages with email and Google auth"
```

---

### Task 7: Dashboard layout, sidebar, header (protected shell)

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Create: `components/layout/app-sidebar.tsx`
- Create: `components/layout/app-header.tsx`
- Create: `components/layout/nav-user.tsx`
- Create: `lib/data/organization.ts`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/server.ts`; shadcn `Sidebar`, `SidebarProvider`, `SidebarInset`, etc. from `components/ui/sidebar.tsx`; `Avatar`, `DropdownMenu`, `Popover` from `components/ui/`.
- Produces: `getCurrentOrgAndUser(): Promise<{ user: User; org: { id: string; name: string }; role: string } | null>` in `lib/data/organization.ts`, consumed by every dashboard page needing org context. `<AppSidebar />`, `<AppHeader user={...} />` components.

- [ ] **Step 1: Apply design-taste-frontend and minimalist-ui skills**

Before writing the shell, invoke `design-taste-frontend` and `minimalist-ui` to settle icon choices, spacing rhythm, and header composition — still strictly shadcn components + Tailwind layout only, no custom CSS.

- [ ] **Step 2: Create org data-fetching helper**

`lib/data/organization.ts`:
```ts
import { createClient } from '@/lib/supabase/server'

export type CurrentOrgAndUser = {
  user: { id: string; email: string }
  org: { id: string; name: string }
  role: string
}

export async function getCurrentOrgAndUser(): Promise<CurrentOrgAndUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: member } = await supabase
    .from('members')
    .select('role, organization_id, organizations(id, name)')
    .eq('user_id', user.id)
    .single()

  if (!member || !member.organizations) return null

  const org = Array.isArray(member.organizations) ? member.organizations[0] : member.organizations

  return {
    user: { id: user.id, email: user.email ?? '' },
    org: { id: org.id, name: org.name },
    role: member.role,
  }
}
```

- [ ] **Step 3: Create AppSidebar**

`components/layout/app-sidebar.tsx` — build using the shadcn `Sidebar` primitives already in `components/ui/sidebar.tsx`. Structure (verify exact sub-component API by reading `components/ui/sidebar.tsx` first, since it's a large vendored block — use `SidebarProvider`/`Sidebar`/`SidebarHeader`/`SidebarContent`/`SidebarGroup`/`SidebarGroupLabel`/`SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton`/`SidebarFooter` per that file's exports):

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  BookOpen,
  Calendar,
  Clock,
  Users,
  UserCog,
  MessageSquare,
  BarChart3,
  Bot,
  Building2,
  Plug,
  BookMarked,
  Settings,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const navSections = [
  {
    label: null,
    items: [
      { title: 'Home', url: '/', icon: Home },
      { title: 'Guides', url: '/guides', icon: BookOpen },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'Calendar', url: '/calendar', icon: Calendar },
      { title: 'Availability', url: '/availability', icon: Clock },
      { title: 'Clients', url: '/clients', icon: Users },
      { title: 'Staff', url: '/staff', icon: UserCog },
      { title: 'Conversations', url: '/conversations', icon: MessageSquare },
      { title: 'Analytics', url: '/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Receptionist',
    items: [{ title: 'AI Agents', url: '/agents', icon: Bot }],
  },
  {
    label: 'Setup',
    items: [
      { title: 'Organization', url: '/organization', icon: Building2 },
      { title: 'Integrations', url: '/integrations', icon: Plug },
      { title: 'Booking Page', url: '/booking-page', icon: BookMarked },
    ],
  },
  {
    label: 'General',
    items: [{ title: 'Settings', url: '/settings', icon: Settings }],
  },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 text-sm font-semibold">FrontDesk.ai</span>
      </SidebarHeader>
      <SidebarContent>
        {navSections.map((section, i) => (
          <SidebarGroup key={i}>
            {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={pathname === item.url}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <Card>
          <CardContent className="p-3">
            <p className="text-sm font-medium">Upgrade to Pro</p>
            <p className="text-xs text-muted-foreground">Unlock more agents and minutes.</p>
            <Button size="sm" className="mt-2 w-full">
              Upgrade
            </Button>
          </CardContent>
        </Card>
      </SidebarFooter>
    </Sidebar>
  )
}
```

- [ ] **Step 4: Create NavUser (avatar dropdown)**

`components/layout/nav-user.tsx`:
```tsx
'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { logOut } from '@/app/(auth)/actions'

export function NavUser({ email }: { email: string }) {
  const initial = email.charAt(0).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <Avatar>
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>Usage summary</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/settings">Settings</a>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Dark mode (coming soon)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logOut()}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 5: Create AppHeader**

`components/layout/app-header.tsx`:
```tsx
import { Bot, HelpCircle, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { NavUser } from './nav-user'

export function AppHeader({ email }: { email: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <SidebarTrigger />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Assistant">
          <Bot />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Help">
          <HelpCircle />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end">
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </PopoverContent>
        </Popover>
        <NavUser email={email} />
      </div>
    </header>
  )
}
```

- [ ] **Step 6: Create protected dashboard layout**

`app/(dashboard)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { getCurrentOrgAndUser } from '@/lib/data/organization'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentOrgAndUser()

  if (!context) {
    redirect('/login')
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader email={context.user.email} />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: no TypeScript errors. (Pages referenced by sidebar links don't exist yet — Task 8 creates them. Build will fail on missing routes until then; if so, proceed directly to Task 8 before verifying build here, or stub minimal `page.tsx` files first.)

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/layout.tsx" components/layout lib/data
git commit -m "feat: add protected dashboard shell with sidebar and header"
```

---

### Task 8: Dashboard pages (Home, Organization, Settings, placeholders)

**Files:**
- Create: `app/(dashboard)/page.tsx` (Home)
- Create: `app/(dashboard)/organization/page.tsx`
- Create: `components/organization/org-name-form.tsx`
- Create: `app/(dashboard)/settings/page.tsx`
- Create: `components/layout/placeholder-page.tsx`
- Create: `app/(dashboard)/guides/page.tsx`
- Create: `app/(dashboard)/calendar/page.tsx`
- Create: `app/(dashboard)/availability/page.tsx`
- Create: `app/(dashboard)/clients/page.tsx`
- Create: `app/(dashboard)/staff/page.tsx`
- Create: `app/(dashboard)/conversations/page.tsx`
- Create: `app/(dashboard)/analytics/page.tsx`
- Create: `app/(dashboard)/agents/page.tsx`
- Create: `app/(dashboard)/integrations/page.tsx`
- Create: `app/(dashboard)/booking-page/page.tsx`
- Create: `app/(auth)/actions.ts` — add `updateOrganizationName` action (modify, not create — file exists from Task 4)

**Interfaces:**
- Consumes: `getCurrentOrgAndUser()` from `lib/data/organization.ts`; `organizationNameSchema` from `lib/validations/organization.ts`.
- Produces: `<PlaceholderPage title icon description />` reusable component used by all 9 placeholder routes.

- [ ] **Step 1: Create reusable PlaceholderPage component**

`components/layout/placeholder-page.tsx`:
```tsx
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function PlaceholderPage({
  title,
  icon: Icon,
  description,
}: {
  title: string
  icon: LucideIcon
  description: string
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Icon className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Coming soon</p>
          <p className="text-sm text-muted-foreground">This feature is on the way.</p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Create all 9 placeholder pages**

Each follows this pattern, e.g. `app/(dashboard)/calendar/page.tsx`:
```tsx
import { Calendar } from 'lucide-react'
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export default function CalendarPage() {
  return (
    <PlaceholderPage
      title="Calendar"
      icon={Calendar}
      description="Manage appointments and scheduling."
    />
  )
}
```

Repeat for each with matching icon/title/description:
- `guides/page.tsx` — `BookOpen`, "Guides", "Learn how to get the most out of FrontDesk.ai."
- `availability/page.tsx` — `Clock`, "Availability", "Set your business hours and availability windows."
- `clients/page.tsx` — `Users`, "Clients", "View and manage your client records."
- `staff/page.tsx` — `UserCog`, "Staff", "Manage staff members and permissions."
- `conversations/page.tsx` — `MessageSquare`, "Conversations", "Review call transcripts and summaries."
- `analytics/page.tsx` — `BarChart3`, "Analytics", "Track call volume and performance."
- `agents/page.tsx` — `Bot`, "AI Agents", "Configure your AI receptionists."
- `integrations/page.tsx` — `Plug`, "Integrations", "Connect calendars, CRMs, and other tools."
- `booking-page/page.tsx` — `BookMarked`, "Booking Page", "Customize your public booking page."

- [ ] **Step 3: Write failing test for org name update action**

Append to `app/(auth)/actions.test.ts`:
```ts
import { updateOrganizationName } from './actions'

describe('updateOrganizationName', () => {
  it('returns validation error for empty name', async () => {
    const result = await updateOrganizationName('org-id', { name: '' })
    expect(result).toEqual({ error: 'Organization name is required' })
  })
})
```

Run: `npm test -- app/\(auth\)/actions.test.ts`
Expected: FAIL — `updateOrganizationName` not exported.

- [ ] **Step 4: Add updateOrganizationName action**

Append to `app/(auth)/actions.ts`:
```ts
import { revalidatePath } from 'next/cache'
import { organizationNameSchema, type OrganizationNameInput } from '@/lib/validations/organization'

export async function updateOrganizationName(
  orgId: string,
  input: OrganizationNameInput
): Promise<{ error: string } | { success: true }> {
  const parsed = organizationNameSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({ name: parsed.data.name })
    .eq('id', orgId)

  if (error) {
    return { error: 'Could not update organization name. Only owners can make changes.' }
  }

  revalidatePath('/organization')
  return { success: true }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- app/\(auth\)/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Create OrgNameForm client component**

`components/organization/org-name-form.tsx`:
```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  organizationNameSchema,
  type OrganizationNameInput,
} from '@/lib/validations/organization'
import { updateOrganizationName } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export function OrgNameForm({
  orgId,
  initialName,
  canEdit,
}: {
  orgId: string
  initialName: string
  canEdit: boolean
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationNameInput>({
    resolver: zodResolver(organizationNameSchema),
    defaultValues: { name: initialName },
  })

  async function onSubmit(input: OrganizationNameInput) {
    const result = await updateOrganizationName(orgId, input)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Organization name updated.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Organization name</Label>
        <Input id="name" disabled={!canEdit} {...register('name')} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      {canEdit && (
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      )}
    </form>
  )
}
```

- [ ] **Step 7: Create Organization settings page**

`app/(dashboard)/organization/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { OrgNameForm } from '@/components/organization/org-name-form'

export default async function OrganizationPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="text-muted-foreground">Manage your organization details.</p>
      </div>
      <OrgNameForm
        orgId={context.org.id}
        initialName={context.org.name}
        canEdit={context.role === 'owner'}
      />
    </div>
  )
}
```

- [ ] **Step 8: Create Settings page**

`app/(dashboard)/settings/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { Button } from '@/components/ui/button'
import { logOut } from '@/app/(auth)/actions'

export default async function SettingsPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage your account.</p>
      </div>
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-medium">Email</p>
        <p className="text-sm text-muted-foreground">{context.user.email}</p>
      </div>
      <form action={logOut}>
        <Button variant="outline" type="submit">
          Log out
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 9: Create Home page**

`app/(dashboard)/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'

export default async function HomePage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {context.org.name}</h1>
      <p className="text-muted-foreground">Here&apos;s what&apos;s happening with your AI receptionist.</p>
    </div>
  )
}
```

- [ ] **Step 10: Verify build**

Run: `npm run build`
Expected: no TypeScript errors, all routes compile.

- [ ] **Step 11: Commit**

```bash
git add app/\(dashboard\) components/organization components/layout/placeholder-page.tsx "app/(auth)/actions.ts" "app/(auth)/actions.test.ts"
git commit -m "feat: add dashboard pages including organization settings and placeholders"
```

---

### Task 9: Loading and error states

**Files:**
- Create: `app/(dashboard)/loading.tsx`
- Create: `app/(dashboard)/error.tsx`
- Create: `app/(auth)/login/loading.tsx`
- Create: `app/(auth)/signup/loading.tsx`

**Interfaces:**
- Consumes: shadcn `Skeleton`, `Alert`, `AlertTitle`, `AlertDescription`, `Button` from `components/ui/`.

- [ ] **Step 1: Create dashboard loading skeleton**

`app/(dashboard)/loading.tsx`:
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
```

- [ ] **Step 2: Create dashboard error boundary**

`app/(dashboard)/error.tsx`:
```tsx
'use client'

import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>We couldn&apos;t load this page. Please try again.</p>
        <Button size="sm" variant="outline" onClick={reset}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  )
}
```

- [ ] **Step 3: Create auth page loading skeletons**

`app/(auth)/login/loading.tsx` and `app/(auth)/signup/loading.tsx` (identical pattern):
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function AuthLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/loading.tsx" "app/(dashboard)/error.tsx" "app/(auth)/login/loading.tsx" "app/(auth)/signup/loading.tsx"
git commit -m "feat: add loading skeletons and error boundary for dashboard and auth"
```

---

### Task 10: Playwright smoke tests (BLOCKED: needs Task 2 applied + real Supabase project)

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: running dev server at `http://localhost:3000`, live Supabase project from Task 2.

**BLOCKED:** Requires the Supabase migration to be live (Task 2) since these tests exercise real signup/login against the database. Do not run against a placeholder/fake backend.

- [ ] **Step 1: Create Playwright config**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 2: Write signup-to-dashboard and login-logout smoke test**

`e2e/auth.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

function uniqueEmail() {
  return `test-${Date.now()}@example.com`
}

test('signup creates an account and lands on the dashboard', async ({ page }) => {
  const email = uniqueEmail()

  await page.goto('/signup')
  await page.getByLabel('Business name').fill('Acme Test Co')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByText('Welcome, Acme Test Co')).toBeVisible()
})

test('login and logout roundtrip', async ({ page }) => {
  const email = uniqueEmail()

  await page.goto('/signup')
  await page.getByLabel('Business name').fill('Roundtrip Co')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
})
```

- [ ] **Step 3: Add test scripts to package.json**

Add: `"test:e2e": "playwright test"`

- [ ] **Step 4: Run tests against live Supabase project**

Run: `npx playwright install chromium` then `npm run test:e2e`
Expected: PASS (2 tests). If it fails, check that `.env.local` has real (not placeholder) Supabase credentials and the Task 2 migration was applied.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json
git commit -m "test: add signup, login, and logout smoke tests"
```

---

### Task 11: README and self-hosting docs update

**Files:**
- Modify: `README.md`

**Interfaces:** None (documentation only).

- [ ] **Step 1: Read current README**

Read `README.md` to see what boilerplate content exists (likely default `create-next-app` content).

- [ ] **Step 2: Replace with project-specific setup instructions**

Update `README.md` to include: project description (one paragraph, pointing to `docs/FrontDesk.ai_Design_Document_Page_1.md` for full vision), prerequisites (Node version, a Supabase project), setup steps (`npm install`, copy `.env.example` to `.env.local` and fill in Supabase credentials, apply migrations via `npx supabase db push` after `npx supabase link`, `npm run dev`), and a "Running tests" section (`npm test` for unit, `npm run test:e2e` for Playwright).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with setup and testing instructions"
```

---

## Self-Review Notes

- **Spec coverage:** Auth (email/password + Google) → Tasks 4–6. Org auto-creation → Tasks 2, 4, 5. RLS → Task 2. Dashboard shell/nav → Tasks 7–8. Real pages (Home/Org/Settings) → Task 8. Placeholders → Task 8. Loading/error states → Task 9. Testing (Vitest + Playwright) → Tasks 3, 4, 10. Local self-host docs → Task 11 (adjusted to hosted-Supabase workflow per user's environment choice, documents `supabase link` + `db push` against their cloud project rather than `supabase start`).
- **Type consistency:** `getCurrentOrgAndUser()` return shape (`{ user, org, role }`) used consistently across Tasks 7, 8. Server action error shape `{ error: string }` consistent across Tasks 4, 8.
- **Blocked tasks:** Task 2 (applying migration to a live project) and Task 10 (e2e tests need real signup/login against the database) require Supabase credentials. Task 4's unit test uses a mocked Supabase client so it is not blocked, but its manual runtime behavior is only observable once Task 2's migration is live. Builder must pause and request Supabase credentials before executing genuinely blocked steps rather than fabricating a project.
