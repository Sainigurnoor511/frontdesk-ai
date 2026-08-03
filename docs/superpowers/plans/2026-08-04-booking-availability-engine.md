# Booking Availability Engine + Public Multi-Step Booking Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real availability-computation engine (business hours, staff overrides, exceptions, time off, existing appointments) and wire it into a new multi-step public booking flow (service → staff → date/time → contact → confirm → success) on `app/book/[slug]/`, replacing the voice agent's bare overlap check with the same engine.

**Architecture:** A new pure data-layer module (`lib/data/availability-engine.ts`) computes open slots per day from existing tables (`business_hours`, `availability_exceptions`, `time_off`, `appointments`, `business_profile`) plus two new tables (`staff_hours`, and a `staff_id` column added to `time_off` and `appointments`). The public booking page becomes a client-side step machine backed by two new server actions in `app/book/actions.ts` (`getPublicAvailableSlots`, `createPublicAppointment`), reusing the existing Turnstile + rate-limit + client-dedup + email-confirmation building blocks already proven in `startPublicCall` / `lib/voice/booking-tools.ts`. The voice booking tools are then switched from the old bare-overlap check onto the new engine.

**Tech Stack:** Next.js 16 App Router Server Actions, Supabase (Postgres + RLS), Zod validation, Vitest, `date-fns`, `react-day-picker` (via existing `components/ui/calendar.tsx`), Resend (existing `sendAppointmentConfirmationEmail`), Cloudflare Turnstile (existing `components/voice/turnstile.tsx`), Redis-backed rate limiting (existing `lib/voice/rate-limit.ts`).

## Global Constraints

- Every `organization_id`-scoped query resolves the caller's org via `supabase.auth.getUser()` → `members` lookup — never a client-supplied id. Public/service-role paths instead resolve org via `getOrganizationBySlug` (already service-role-safe) and never trust a client-supplied `organizationId` for anything except that lookup's output.
- Validation lives in `lib/validations/*.ts` as Zod schemas, not inline in actions/components.
- `server-only` must not be imported by any module also consumed outside a Next.js request context (workers, Vitest) — service-role helpers go in `-service.ts` files per the existing split (`lib/supabase/service-role.ts` vs `lib/supabase/server.ts`).
- Migrations are numbered SQL files in `supabase/migrations/`; RLS policies follow the exact `organization_id in (select organization_id from members where user_id = auth.uid())` pattern (or, for tables keyed by `staff_id`, a join to `staff_members.organization_id` using that same pattern).
- All datetime math in the engine happens in the org's `business_profile.timezone`.
- `business_profile.limit_overlapping_appointments` is never consulted by the engine — it only affects the internal dashboard calendar's manual double-booking allowance.

---

## File Structure

- **Create:** `supabase/migrations/00000000000029_booking_availability_engine.sql` — `staff_hours` table, `staff_id` on `time_off` and `appointments`, `service_id` on `appointments`. (Migration `00000000000028_booking_tool_links.sql` already exists in the repo — this plan's migration is `29`, the next free number; verify against `ls supabase/migrations/` before creating it in case another migration has landed since this plan was written.)
- **Create:** `lib/data/availability-engine.ts` — the `getAvailableSlots` engine (service-role, public-safe) plus a `getStaffForBookingPage` public-safe staff reader.
- **Create:** `lib/data/availability-engine.test.ts` — unit tests for the engine.
- **Modify:** `lib/data/booking-service.ts` — extend `createAppointmentServiceRole` to accept/persist `serviceId`/`staffId`; remove `checkAvailabilityServiceRole` once nothing calls it (Task 6).
- **Modify:** `lib/voice/booking-tools.ts` — swap `check_availability`/`book_appointment` onto the new engine.
- **Modify:** `lib/voice/booking-tools.test.ts` — update mocks/assertions for the swap.
- **Create:** `lib/validations/booking.ts` — Zod schemas for the public booking flow's contact form and the two new server actions.
- **Modify:** `app/book/actions.ts` — add `getPublicAvailableSlots` and `createPublicAppointment`.
- **Modify:** `app/book/actions.test.ts` (create if it doesn't already exist as a test file for this action file) — tests for the two new actions.
- **Modify:** `app/book/[slug]/page.tsx` — fetch and pass staff list.
- **Modify:** `app/book/[slug]/booking-page-public-client.tsx` — add the step machine (service → staff → date/time → contact → confirm → success), gated behind the existing service list becoming clickable.
- **Create:** `app/book/[slug]/booking-flow.tsx` — the new multi-step flow as its own client component (kept separate from `booking-page-public-client.tsx` so that file doesn't balloon — it stays responsible for the page shell + call widget, this one owns the step machine).

---

## Task 1: Migration — new tables and columns

**Files:**
- Create: `supabase/migrations/00000000000029_booking_availability_engine.sql`

**Interfaces:**
- Produces: `staff_hours` table (columns: `id`, `staff_id`, `day_of_week`, `is_open`, `start_time`, `end_time`, `created_at`, `updated_at`), `time_off.staff_id` column, `appointments.service_id` and `appointments.staff_id` columns. All later tasks query these.

Note: `appointments.agent_id`, `.conversation_id`, and `.client_id` are already nullable (added in earlier migrations `00000000000004` and `00000000000028_booking_tool_links.sql`) — no nullability change needed for those in this task.

- [ ] **Step 1: Write the migration SQL**

```sql
create table staff_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_members(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_open boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, day_of_week)
);

alter table staff_hours enable row level security;

create policy "Members can view their organization's staff hours"
  on staff_hours for select
  using (
    staff_id in (
      select id from staff_members where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
  );

create policy "Members can create staff hours in their organization"
  on staff_hours for insert
  with check (
    staff_id in (
      select id from staff_members where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
  );

create policy "Members can update their organization's staff hours"
  on staff_hours for update
  using (
    staff_id in (
      select id from staff_members where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
  );

create policy "Members can delete their organization's staff hours"
  on staff_hours for delete
  using (
    staff_id in (
      select id from staff_members where organization_id in (
        select organization_id from members where user_id = auth.uid()
      )
    )
  );

alter table time_off add column if not exists staff_id uuid references staff_members(id) on delete cascade;

alter table appointments add column if not exists service_id uuid references services(id) on delete set null;
alter table appointments add column if not exists staff_id uuid references staff_members(id) on delete set null;
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db reset` (or `supabase migration up` if using a running local stack — use whichever this repo's other migration tasks used; check `package.json` scripts for a `db:reset` or similar first).
Expected: migration applies with no errors; `staff_hours` table exists; `time_off` and `appointments` have the new nullable columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00000000000029_booking_availability_engine.sql
git commit -m "feat: add staff_hours table and staff_id/service_id columns for availability engine"
```

---

## Task 2: Availability engine — business hours + staff override (core slot math)

**Files:**
- Create: `lib/data/availability-engine.ts`
- Create: `lib/data/availability-engine.test.ts`

**Interfaces:**
- Consumes: `getBusinessProfile` (`lib/data/business.ts`, returns `BusinessProfile` with `timezone`, `bookingSlotIntervalMinutes`, `advanceBookingWindowDays`, `minimumBookingNoticeMinutes`), `getServices` (`lib/data/business.ts`, returns `Service[]` with `durationMinutes`).
- Produces:
  ```ts
  export type DaySlots = { date: string; slots: { startsAt: string; endsAt: string }[] }

  export async function getAvailableSlots(
    organizationId: string,
    input: {
      serviceId: string
      staffId?: string | null
      rangeStart: string // 'YYYY-MM-DD'
      rangeEnd: string   // 'YYYY-MM-DD'
    }
  ): Promise<DaySlots[]>
  ```
  This is the function Task 3, Task 4, Task 6, and Task 7 all call.

This task builds the engine using **only** business hours (org-level) and an optional staff-hours override — no exceptions/time-off/appointments subtraction yet (those are Tasks 3–4, added incrementally so each rule is independently testable).

- [ ] **Step 1: Write the failing tests for org-hours-only slot generation**

```ts
import { describe, it, expect, vi } from 'vitest'
import { getAvailableSlots } from './availability-engine'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

function mockSupabase(tables: Record<string, unknown[]>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
          maybeSingle: () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null }),
          order: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
        }),
        maybeSingle: () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      }),
    }),
  }
}

describe('getAvailableSlots — business hours only', () => {
  it('generates 30-minute slots within a single open day, fitting the service duration', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          {
            id: 'bp-1',
            organization_id: 'org-1',
            timezone: 'UTC',
            booking_slot_interval_minutes: 30,
            advance_booking_window_days: 14,
            minimum_booking_notice_minutes: 0,
            limit_overlapping_appointments: false,
          },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [
          { organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' },
        ],
        staff_hours: [],
        availability_exceptions: [],
        time_off: [],
        appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', {
      serviceId: 'svc-1',
      rangeStart: '2026-08-10', // a Monday
      rangeEnd: '2026-08-10',
    })

    expect(result).toEqual([
      {
        date: '2026-08-10',
        slots: [
          { startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' },
          { startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' },
        ],
      },
    ])
  })

  it('returns no slots for a day the org is closed', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          {
            id: 'bp-1', organization_id: 'org-1', timezone: 'UTC',
            booking_slot_interval_minutes: 30, advance_booking_window_days: 14,
            minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false,
          },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [
          { organization_id: 'org-1', day_of_week: 1, is_open: false, start_time: null, end_time: null },
        ],
        staff_hours: [], availability_exceptions: [], time_off: [], appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', {
      serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10',
    })

    expect(result).toEqual([{ date: '2026-08-10', slots: [] }])
  })

  it('prefers a staff-hours override over business hours when staffId is given', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          {
            id: 'bp-1', organization_id: 'org-1', timezone: 'UTC',
            booking_slot_interval_minutes: 60, advance_booking_window_days: 14,
            minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false,
          },
        ],
        services: [{ id: 'svc-1', duration_minutes: 60 }],
        business_hours: [
          { organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '17:00:00' },
        ],
        staff_hours: [
          { staff_id: 'staff-1', day_of_week: 1, is_open: true, start_time: '12:00:00', end_time: '13:00:00' },
        ],
        availability_exceptions: [], time_off: [], appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', {
      serviceId: 'svc-1', staffId: 'staff-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10',
    })

    expect(result).toEqual([
      {
        date: '2026-08-10',
        slots: [{ startsAt: '2026-08-10T12:00:00.000Z', endsAt: '2026-08-10T13:00:00.000Z' }],
      },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/data/availability-engine.test.ts`
Expected: FAIL — `Cannot find module './availability-engine'` (file doesn't exist yet).

- [ ] **Step 3: Implement the engine (business hours + staff override only)**

```ts
// lib/data/availability-engine.ts
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type DaySlots = { date: string; slots: { startsAt: string; endsAt: string }[] }

type BusinessHoursRow = {
  day_of_week: number
  is_open: boolean
  start_time: string | null
  end_time: string | null
}

type BusinessProfileRow = {
  timezone: string
  booking_slot_interval_minutes: number
  advance_booking_window_days: number
  minimum_booking_notice_minutes: number
}

function enumerateDates(rangeStart: string, rangeEnd: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${rangeStart}T00:00:00.000Z`)
  const end = new Date(`${rangeEnd}T00:00:00.000Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function dayOfWeekFor(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
}

function chunkIntoSlots(
  date: string,
  openStart: string,
  openEnd: string,
  intervalMinutes: number,
  durationMinutes: number
): { startsAt: string; endsAt: string }[] {
  const slots: { startsAt: string; endsAt: string }[] = []
  let cursor = new Date(`${date}T${openStart}.000Z`)
  const closeTime = new Date(`${date}T${openEnd}.000Z`)

  while (true) {
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000)
    if (slotEnd > closeTime) break
    slots.push({ startsAt: cursor.toISOString(), endsAt: slotEnd.toISOString() })
    cursor = new Date(cursor.getTime() + intervalMinutes * 60_000)
  }

  return slots
}

export async function getAvailableSlots(
  organizationId: string,
  input: {
    serviceId: string
    staffId?: string | null
    rangeStart: string
    rangeEnd: string
  }
): Promise<DaySlots[]> {
  const supabase = createServiceRoleClient()

  const [{ data: profile }, { data: serviceRow }, { data: hoursRows }, { data: staffHoursRows }] =
    await Promise.all([
      supabase
        .from('business_profile')
        .select(
          'timezone, booking_slot_interval_minutes, advance_booking_window_days, minimum_booking_notice_minutes'
        )
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase.from('services').select('duration_minutes').eq('id', input.serviceId).maybeSingle(),
      supabase.from('business_hours').select('day_of_week, is_open, start_time, end_time').eq(
        'organization_id',
        organizationId
      ),
      input.staffId
        ? supabase
            .from('staff_hours')
            .select('day_of_week, is_open, start_time, end_time')
            .eq('staff_id', input.staffId)
        : Promise.resolve({ data: [] as BusinessHoursRow[] }),
    ])

  const businessProfile = (profile ?? {
    timezone: 'UTC',
    booking_slot_interval_minutes: 30,
    advance_booking_window_days: 14,
    minimum_booking_notice_minutes: 0,
  }) as BusinessProfileRow
  const durationMinutes = (serviceRow as { duration_minutes: number } | null)?.duration_minutes ?? 30

  const hoursByDay = new Map<number, BusinessHoursRow>(
    ((hoursRows ?? []) as BusinessHoursRow[]).map((row) => [row.day_of_week, row])
  )
  const staffHoursByDay = new Map<number, BusinessHoursRow>(
    ((staffHoursRows ?? []) as BusinessHoursRow[]).map((row) => [row.day_of_week, row])
  )

  const dates = enumerateDates(input.rangeStart, input.rangeEnd)

  return dates.map((date) => {
    const dow = dayOfWeekFor(date)
    const override = staffHoursByDay.get(dow)
    const hours = override ?? hoursByDay.get(dow)

    if (!hours || !hours.is_open || !hours.start_time || !hours.end_time) {
      return { date, slots: [] }
    }

    return {
      date,
      slots: chunkIntoSlots(
        date,
        hours.start_time,
        hours.end_time,
        businessProfile.booking_slot_interval_minutes,
        durationMinutes
      ),
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/data/availability-engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/data/availability-engine.ts lib/data/availability-engine.test.ts
git commit -m "feat: add availability engine with business-hours and staff-hours slot generation"
```

---

## Task 3: Availability engine — subtract exceptions and time off

**Files:**
- Modify: `lib/data/availability-engine.ts`
- Modify: `lib/data/availability-engine.test.ts`

**Interfaces:**
- Consumes: `getAvailableSlots` signature from Task 2 (unchanged).
- Produces: same `getAvailableSlots` signature, now also querying `availability_exceptions` and `time_off`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('getAvailableSlots — exceptions and time off', () => {
  it('excludes a day fully closed by an availability exception', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          { id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [],
        availability_exceptions: [
          { organization_id: 'org-1', type: 'closed', start_date: '2026-08-10', end_date: '2026-08-10', start_time: null, end_time: null },
        ],
        time_off: [], appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(result).toEqual([{ date: '2026-08-10', slots: [] }])
  })

  it('excludes slots covered by org-wide time off regardless of staff selection', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          { id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [], availability_exceptions: [],
        time_off: [
          { organization_id: 'org-1', staff_id: null, scope: 'company', all_day: false, starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
        ],
        appointments: [],
      }) as never
    )

    const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(result).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' }] }])
  })

  it('excludes slots covered by staff-scoped time off only when that staff is selected', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [
          { id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false },
        ],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [], availability_exceptions: [],
        time_off: [
          { organization_id: 'org-1', staff_id: 'staff-1', scope: 'staff', all_day: false, starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
        ],
        appointments: [],
      }) as never
    )

    const withStaff = await getAvailableSlots('org-1', { serviceId: 'svc-1', staffId: 'staff-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(withStaff).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' }] }])

    const withoutStaff = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(withoutStaff).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }, { startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' }] }])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/data/availability-engine.test.ts`
Expected: FAIL — the new three tests fail (exceptions/time-off not yet subtracted); the Task 2 tests still pass.

- [ ] **Step 3: Implement exception and time-off subtraction**

Add to `lib/data/availability-engine.ts`, replacing the final `return dates.map(...)` block:

```ts
type ExceptionRow = {
  type: 'closed' | 'custom_hours'
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
}

type TimeOffRow = {
  staff_id: string | null
  scope: string
  all_day: boolean
  starts_at: string
  ends_at: string
}

function subtractInterval(
  slots: { startsAt: string; endsAt: string }[],
  blockStart: string,
  blockEnd: string
): { startsAt: string; endsAt: string }[] {
  const blockStartMs = new Date(blockStart).getTime()
  const blockEndMs = new Date(blockEnd).getTime()
  return slots.filter((slot) => {
    const slotStartMs = new Date(slot.startsAt).getTime()
    const slotEndMs = new Date(slot.endsAt).getTime()
    return slotEndMs <= blockStartMs || slotStartMs >= blockEndMs
  })
}
```

And extend the main function's parallel fetch + per-day loop:

```ts
  const [
    { data: profile },
    { data: serviceRow },
    { data: hoursRows },
    { data: staffHoursRows },
    { data: exceptionRows },
    { data: timeOffRows },
  ] = await Promise.all([
    supabase.from('business_profile').select(
      'timezone, booking_slot_interval_minutes, advance_booking_window_days, minimum_booking_notice_minutes'
    ).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('services').select('duration_minutes').eq('id', input.serviceId).maybeSingle(),
    supabase.from('business_hours').select('day_of_week, is_open, start_time, end_time').eq('organization_id', organizationId),
    input.staffId
      ? supabase.from('staff_hours').select('day_of_week, is_open, start_time, end_time').eq('staff_id', input.staffId)
      : Promise.resolve({ data: [] as BusinessHoursRow[] }),
    supabase
      .from('availability_exceptions')
      .select('type, start_date, end_date, start_time, end_time')
      .eq('organization_id', organizationId)
      .lte('start_date', input.rangeEnd)
      .gte('end_date', input.rangeStart),
    supabase
      .from('time_off')
      .select('staff_id, scope, all_day, starts_at, ends_at')
      .eq('organization_id', organizationId)
      .lt('starts_at', `${input.rangeEnd}T23:59:59.999Z`)
      .gt('ends_at', `${input.rangeStart}T00:00:00.000Z`),
  ])
```

Then in the `dates.map((date) => { ... })` body, after computing `hours` and before returning, insert:

```ts
    if (!hours || !hours.is_open || !hours.start_time || !hours.end_time) {
      return { date, slots: [] }
    }

    const closedByException = ((exceptionRows ?? []) as ExceptionRow[]).some(
      (ex) => ex.type === 'closed' && date >= ex.start_date && date <= ex.end_date
    )
    if (closedByException) {
      return { date, slots: [] }
    }

    let slots = chunkIntoSlots(
      date,
      hours.start_time,
      hours.end_time,
      businessProfile.booking_slot_interval_minutes,
      durationMinutes
    )

    const relevantTimeOff = ((timeOffRows ?? []) as TimeOffRow[]).filter(
      (block) => block.scope === 'company' || (block.scope === 'staff' && block.staff_id === input.staffId)
    )
    for (const block of relevantTimeOff) {
      slots = subtractInterval(slots, block.starts_at, block.ends_at)
    }

    return { date, slots }
```

(Remove the now-duplicated early `return`/`chunkIntoSlots` call that Task 2 left at the end of the map body.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/data/availability-engine.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/data/availability-engine.ts lib/data/availability-engine.test.ts
git commit -m "feat: subtract availability exceptions and time off in availability engine"
```

---

## Task 4: Availability engine — subtract existing appointments, advance window, minimum notice

**Files:**
- Modify: `lib/data/availability-engine.ts`
- Modify: `lib/data/availability-engine.test.ts`

**Interfaces:**
- Consumes/Produces: same `getAvailableSlots` signature.

- [ ] **Step 1: Write the failing tests**

```ts
describe('getAvailableSlots — appointments, advance window, minimum notice', () => {
  it('excludes a slot already booked by an existing appointment, org-wide when no staff selected', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [{ id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false }],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [], availability_exceptions: [], time_off: [],
        appointments: [
          { organization_id: 'org-1', staff_id: null, status: 'confirmed', starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
        ],
      }) as never
    )

    const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(result).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:30:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' }] }])
  })

  it('ignores cancelled appointments', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [{ id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false }],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '09:30:00' }],
        staff_hours: [], availability_exceptions: [], time_off: [],
        appointments: [
          { organization_id: 'org-1', staff_id: null, status: 'cancelled', starts_at: '2026-08-10T09:00:00.000Z', ends_at: '2026-08-10T09:30:00.000Z' },
        ],
      }) as never
    )

    const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
    expect(result).toEqual([{ date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }] }])
  })

  it('drops dates beyond the advance booking window', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [{ id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 1, minimum_booking_notice_minutes: 0, limit_overlapping_appointments: false }],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '10:00:00' }],
        staff_hours: [], availability_exceptions: [], time_off: [], appointments: [],
      }) as never
    )

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T00:00:00.000Z'))
    try {
      const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-09', rangeEnd: '2026-08-11' })
      expect(result.find((d) => d.date === '2026-08-11')?.slots).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops slots starting sooner than the minimum booking notice', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockSupabase({
        business_profile: [{ id: 'bp-1', organization_id: 'org-1', timezone: 'UTC', booking_slot_interval_minutes: 30, advance_booking_window_days: 14, minimum_booking_notice_minutes: 120, limit_overlapping_appointments: false }],
        services: [{ id: 'svc-1', duration_minutes: 30 }],
        business_hours: [{ organization_id: 'org-1', day_of_week: 1, is_open: true, start_time: '09:00:00', end_time: '12:00:00' }],
        staff_hours: [], availability_exceptions: [], time_off: [], appointments: [],
      }) as never
    )

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T09:00:00.000Z'))
    try {
      const result = await getAvailableSlots('org-1', { serviceId: 'svc-1', rangeStart: '2026-08-10', rangeEnd: '2026-08-10' })
      expect(result[0].slots.every((s) => new Date(s.startsAt).getTime() >= new Date('2026-08-10T11:00:00.000Z').getTime())).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/data/availability-engine.test.ts`
Expected: FAIL on the 4 new tests.

- [ ] **Step 3: Implement appointment subtraction, advance window, minimum notice**

Add fetch of `appointments` to the `Promise.all` array in `getAvailableSlots`:

```ts
    supabase
      .from('appointments')
      .select('staff_id, status, starts_at, ends_at')
      .eq('organization_id', organizationId)
      .neq('status', 'cancelled')
      .lt('starts_at', `${input.rangeEnd}T23:59:59.999Z`)
      .gt('ends_at', `${input.rangeStart}T00:00:00.000Z`),
```

(destructure as `{ data: appointmentRows }`.)

Add type and filtering in the per-day map body, right after the time-off subtraction loop:

```ts
type AppointmentRow = { staff_id: string | null; status: string; starts_at: string; ends_at: string }

    const relevantAppointments = ((appointmentRows ?? []) as AppointmentRow[]).filter(
      (appt) => !input.staffId || appt.staff_id === input.staffId || appt.staff_id === null
    )
    for (const appt of relevantAppointments) {
      slots = subtractInterval(slots, appt.starts_at, appt.ends_at)
    }
```

Add advance-window and minimum-notice cutoffs at the very end of the per-day map body, right before the final `return { date, slots }`:

```ts
    const now = Date.now()
    const windowCutoffMs = now + businessProfile.advance_booking_window_days * 86_400_000
    const noticeCutoffMs = now + businessProfile.minimum_booking_notice_minutes * 60_000
    const dateStartMs = new Date(`${date}T00:00:00.000Z`).getTime()
    if (dateStartMs > windowCutoffMs) {
      return { date, slots: [] }
    }
    slots = slots.filter((slot) => new Date(slot.startsAt).getTime() >= noticeCutoffMs)

    return { date, slots }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/data/availability-engine.test.ts`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/data/availability-engine.ts lib/data/availability-engine.test.ts
git commit -m "feat: subtract existing appointments and apply booking window/notice cutoffs"
```

---

## Task 5: Public-safe staff reader for the booking page

**Files:**
- Modify: `lib/data/availability-engine.ts` (add `getStaffForBookingPage` — kept in this file since it's only consumed alongside the engine; if this file grows unwieldy later, split it out, but for now it's one more small function)
- Modify: `lib/data/availability-engine.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BookingPageStaff = { id: string; name: string }
  export async function getStaffForBookingPage(organizationId: string): Promise<BookingPageStaff[]>
  ```
  Consumed by Task 8 (`app/book/[slug]/page.tsx`).

- [ ] **Step 1: Write the failing test**

```ts
describe('getStaffForBookingPage', () => {
  it('returns only active staff opted into the booking page, using display name when set', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    vi.mocked(createServiceRoleClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({
              data: [
                { id: 'staff-1', full_name: 'Ada Lovelace', display_name: null },
                { id: 'staff-2', full_name: 'Grace Hopper', display_name: 'Coach Grace' },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as never)

    const { getStaffForBookingPage } = await import('./availability-engine')
    const result = await getStaffForBookingPage('org-1')

    expect(result).toEqual([
      { id: 'staff-1', name: 'Ada Lovelace' },
      { id: 'staff-2', name: 'Coach Grace' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/data/availability-engine.test.ts -t "getStaffForBookingPage"`
Expected: FAIL — `getStaffForBookingPage is not a function`.

- [ ] **Step 3: Implement it**

Add to `lib/data/availability-engine.ts`:

```ts
export type BookingPageStaff = { id: string; name: string }

export async function getStaffForBookingPage(organizationId: string): Promise<BookingPageStaff[]> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('staff_members')
    .select('id, full_name, display_name')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('show_on_booking_page', true)

  return ((data ?? []) as { id: string; full_name: string; display_name: string | null }[]).map((row) => ({
    id: row.id,
    name: row.display_name ?? row.full_name,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/data/availability-engine.test.ts -t "getStaffForBookingPage"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/availability-engine.ts lib/data/availability-engine.test.ts
git commit -m "feat: add public-safe staff reader for the booking page"
```

---

## Task 6: Extend appointment creation with service/staff, swap voice tools onto the engine

**Files:**
- Modify: `lib/data/booking-service.ts`
- Create: `lib/data/booking-service.test.ts`
- Modify: `lib/voice/booking-tools.ts`
- Modify: `lib/voice/booking-tools.test.ts`

**Interfaces:**
- Consumes: `getAvailableSlots` (Task 2–4).
- Produces `findOrCreateClientServiceRole` unchanged in signature (`FindOrCreateClientInput` and return type both stay as they are today) — only its internal no-phone branch changes to insert with a sentinel instead of throwing. Consumed by Task 7.
- Produces:
  ```ts
  export type CreateAppointmentServiceInput = {
    title: string
    clientName: string
    clientPhone: string | null
    clientId: string
    startsAt: string
    endsAt: string
    notes?: string | null
    serviceId?: string | null
    staffId?: string | null
  }
  export async function createAppointmentServiceRole(
    organizationId: string, agentId: string | null, conversationId: string | null,
    input: CreateAppointmentServiceInput
  ): Promise<AppointmentRow>
  ```
  `agentId`/`conversationId` are widened from `string` to `string | null` in this task — `appointments.agent_id` and `.conversation_id` are already nullable columns (confirmed in Task 1), and a page-booked appointment has neither an agent nor a conversation behind it. `lib/voice/booking-tools.ts`'s existing call site keeps passing real (non-null) values; only Task 7's new `createPublicAppointment` passes `null, null`.
  Consumed by Task 7 (`createPublicAppointment`).

- [ ] **Step 1: Write the failing test for the extended insert shape**

Add to a new `describe` block in a new test file `lib/data/booking-service.test.ts` (this file currently has no tests):

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: vi.fn() }))

describe('createAppointmentServiceRole', () => {
  it('persists serviceId and staffId when provided', async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'appt-1' }, error: null }) }),
    })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from: () => ({ insert: insertMock }) } as never)

    const { createAppointmentServiceRole } = await import('./booking-service')
    await createAppointmentServiceRole('org-1', 'agent-1', 'conv-1', {
      title: 'Personal training',
      clientName: 'Ada Lovelace',
      clientPhone: null,
      clientId: 'client-1',
      startsAt: '2026-08-10T09:00:00.000Z',
      endsAt: '2026-08-10T09:30:00.000Z',
      serviceId: 'svc-1',
      staffId: 'staff-1',
    })

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ service_id: 'svc-1', staff_id: 'staff-1' })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/data/booking-service.test.ts`
Expected: FAIL — `insertMock` called without `service_id`/`staff_id` keys (or `toHaveBeenCalledWith` mismatch).

- [ ] **Step 3: Update `createAppointmentServiceRole` and swap the voice tools onto the engine**

In `lib/data/booking-service.ts`, update the type and insert call:

```ts
export type CreateAppointmentServiceInput = {
  title: string
  clientName: string
  clientPhone: string | null
  clientId: string
  startsAt: string
  endsAt: string
  notes?: string | null
  serviceId?: string | null
  staffId?: string | null
}

export async function createAppointmentServiceRole(
  organizationId: string,
  agentId: string | null,
  conversationId: string | null,
  input: CreateAppointmentServiceInput
): Promise<AppointmentRow> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: organizationId,
      agent_id: agentId,
      title: input.title,
      client_name: input.clientName,
      client_phone: input.clientPhone,
      client_id: input.clientId,
      conversation_id: conversationId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      notes: input.notes ?? null,
      service_id: input.serviceId ?? null,
      staff_id: input.staffId ?? null,
      status: 'confirmed',
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create appointment: ${error?.message ?? 'unknown error'}`)
  }

  return data as AppointmentRow
}
```

Remove `checkAvailabilityServiceRole` from `lib/data/booking-service.ts` entirely (delete the function and its `ConflictRow` type — nothing outside `lib/voice/booking-tools.ts` calls it, and that file switches to the engine below).

**Fix a phone-required gap in `findOrCreateClientServiceRole` that this task's phone-optional contact form (Task 9) will hit.** `clients.phone_number` is a `NOT NULL` column, and the existing function currently throws `'A phone number is required to create a client'` whenever no phone is supplied and no existing client is matched by phone/email. The public booking flow's contact step only requires name + email (phone optional), so a first-time booker with no phone would crash the booking. Update the insert to satisfy the `NOT NULL` constraint with an explicit sentinel instead of relying on a real phone number:

```ts
  if (!phone) {
    const { data: created, error } = await supabase
      .from('clients')
      .insert({
        organization_id: organizationId,
        name: input.name,
        phone_number: 'unknown',
        email,
      })
      .select('id')
      .single()

    if (error || !created) {
      throw new Error(`Failed to create client: ${error?.message ?? 'unknown error'}`)
    }

    return { id: created.id, isNew: true }
  }

  const { data: created, error } = await supabase
    .from('clients')
    .insert({
      organization_id: organizationId,
      name: input.name,
      phone_number: phone,
      email,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`Failed to create client: ${error?.message ?? 'unknown error'}`)
  }

  return { id: created.id, isNew: true }
```

(This replaces the function's final `if (!phone) { throw ... }` guard and the single insert block below it with the two-branch version above — phone-having callers keep the exact same insert they had before, phone-less callers now insert with a `'unknown'` sentinel instead of throwing.) Add one test to whatever test file covers `findOrCreateClientServiceRole` today (check for an existing `lib/data/booking-service.test.ts` describe block for it — if none exists yet, add one alongside the `createAppointmentServiceRole` test from Step 1 above) asserting it succeeds and inserts `phone_number: 'unknown'` when `phoneNumber: null` and no existing client matches by email either.

In `lib/voice/booking-tools.ts`, replace the `checkAvailabilityServiceRole` import and both call sites:

```ts
import {
  createAppointmentServiceRole,
  findOrCreateClientServiceRole,
} from '@/lib/data/booking-service'
import { getAvailableSlots } from '@/lib/data/availability-engine'
```

Add a small local helper right after the imports (both tools need "is this exact window open"):

```ts
async function isSlotOpen(organizationId: string, startsAt: string, endsAt: string): Promise<boolean> {
  const date = startsAt.slice(0, 10)
  const days = await getAvailableSlots(organizationId, {
    serviceId: '', // voice booking has no service concept yet; engine treats missing service as 30-min default duration, exact window is checked below regardless
    rangeStart: date,
    rangeEnd: date,
  })
  const slotsForDay = days[0]?.slots ?? []
  return slotsForDay.some((slot) => slot.startsAt === startsAt && slot.endsAt === endsAt)
}
```

Update `check_availability`'s `execute`:

```ts
      execute: async (args) => {
        try {
          const available = await isSlotOpen(organizationId, args.startsAt, args.endsAt)
          if (available) {
            return { available: true }
          }
          return { available: false, conflictingTitle: null }
        } catch (error) {
          console.error('[booking-tools] check_availability failed:', error)
          return { error: 'availability_check_failed' }
        }
      },
```

Update `book_appointment`'s `execute` — replace its `checkAvailabilityServiceRole` call:

```ts
          const available = await isSlotOpen(organizationId, args.startsAt, args.endsAt)
          if (!available) {
            return { error: 'slot_unavailable', conflictingTitle: null }
          }
```

(Everything below that — `findOrCreateClientServiceRole`, `createAppointmentServiceRole`, email — stays unchanged.)

- [ ] **Step 4: Update `lib/voice/booking-tools.test.ts` for the swap**

Replace the `checkAvailabilityServiceRole` mock with an `availability-engine` mock and update assertions accordingly:

```ts
vi.mock('@/lib/data/availability-engine', () => ({
  getAvailableSlots: vi.fn(),
}))

vi.mock('@/lib/data/booking-service', () => ({
  findOrCreateClientServiceRole: vi.fn(),
  createAppointmentServiceRole: vi.fn(),
}))
```

Update the top-level imports:

```ts
import { getAvailableSlots } from '@/lib/data/availability-engine'
import {
  findOrCreateClientServiceRole,
  createAppointmentServiceRole,
} from '@/lib/data/booking-service'
```

Update each test's mock setup and assertions, e.g. the "available" case:

```ts
  it('returns available when the slot is free', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { date: '2026-08-03', slots: [{ startsAt: '2026-08-03T14:00:00Z', endsAt: '2026-08-03T15:00:00Z' }] },
    ])

    const result = await buildTools().check_availability.execute(
      { startsAt: '2026-08-03T14:00:00Z', endsAt: '2026-08-03T15:00:00Z' },
      executeOpts
    )

    expect(result).toEqual({ available: true })
  })
```

and the "taken" case:

```ts
  it('returns available: false when the slot is not open', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([{ date: '2026-08-03', slots: [] }])

    const result = await buildTools().check_availability.execute(
      { startsAt: '2026-08-03T14:00:00Z', endsAt: '2026-08-03T15:00:00Z' },
      executeOpts
    )

    expect(result).toEqual({ available: false, conflictingTitle: null })
  })
```

and the failure case (mock `getAvailableSlots` to reject instead of `checkAvailabilityServiceRole`), and similarly for all `book_appointment` tests — replace `checkAvailabilityServiceRole` mock setup/assertions with `getAvailableSlots` returning either a matching slot (available) or `[{ date: ..., slots: [] }]` (unavailable), and drop the `conflictingTitle` expectations that relied on real conflict data (now always `null` per the simplified helper).

- [ ] **Step 5: Run all affected tests**

Run: `npx vitest run lib/data/booking-service.test.ts lib/voice/booking-tools.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/data/booking-service.ts lib/data/booking-service.test.ts lib/voice/booking-tools.ts lib/voice/booking-tools.test.ts
git commit -m "feat: persist service/staff on appointments, swap voice booking tools onto the availability engine"
```

---

## Task 7: Public server actions — `getPublicAvailableSlots` and `createPublicAppointment`

**Files:**
- Create: `lib/validations/booking.ts`
- Modify: `app/book/actions.ts`
- Create: `app/book/actions.test.ts`

**Interfaces:**
- Consumes: `getAvailableSlots`, `getStaffForBookingPage` (Task 2–5), `createAppointmentServiceRole`, `findOrCreateClientServiceRole` (Task 6), `sendAppointmentConfirmationEmail` (existing), `checkAndConsumeRateLimit` (existing), `getOrganizationBySlug`-style org resolution is not needed here since `organizationId` is already public info passed down from the page (same trust model as `startPublicCall`).
- Produces:
  ```ts
  export async function getPublicAvailableSlots(
    input: { organizationId: string; serviceId: string; staffId?: string | null; date: string }
  ): Promise<{ error: string } | { slots: { startsAt: string; endsAt: string }[] }>

  export async function createPublicAppointment(
    input: {
      organizationId: string
      serviceId: string
      staffId?: string | null
      startsAt: string
      endsAt: string
      clientName: string
      clientEmail: string
      clientPhone?: string
      turnstileToken?: string
    }
  ): Promise<{ error: string } | { success: true; appointmentId: string }>
  ```
  Consumed by Task 9 (`booking-flow.tsx`).

- [ ] **Step 1: Write the Zod schemas**

```ts
// lib/validations/booking.ts
import { z } from 'zod'

export const getPublicAvailableSlotsSchema = z.object({
  organizationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type GetPublicAvailableSlotsInput = z.infer<typeof getPublicAvailableSlotsSchema>

export const createPublicAppointmentSchema = z.object({
  organizationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  clientName: z.string().min(1).max(200),
  clientEmail: z.string().email(),
  clientPhone: z.string().max(30).optional(),
  businessName: z.string().optional(),
  turnstileToken: z.string().optional(),
})
export type CreatePublicAppointmentInput = z.infer<typeof createPublicAppointmentSchema>
```

- [ ] **Step 2: Write failing tests for the two new actions**

```ts
// app/book/actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/availability-engine', () => ({
  getAvailableSlots: vi.fn(),
}))
vi.mock('@/lib/data/booking-service', () => ({
  findOrCreateClientServiceRole: vi.fn(),
  createAppointmentServiceRole: vi.fn(),
}))
vi.mock('@/lib/email/send-appointment-confirmation', () => ({
  sendAppointmentConfirmationEmail: vi.fn(),
}))
vi.mock('@/lib/voice/rate-limit', () => ({
  checkAndConsumeRateLimit: vi.fn(),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}))

import { getAvailableSlots } from '@/lib/data/availability-engine'
import { findOrCreateClientServiceRole, createAppointmentServiceRole } from '@/lib/data/booking-service'
import { sendAppointmentConfirmationEmail } from '@/lib/email/send-appointment-confirmation'
import { checkAndConsumeRateLimit } from '@/lib/voice/rate-limit'
import { getPublicAvailableSlots, createPublicAppointment } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.TURNSTILE_SECRET_KEY
  vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: true, remaining: 4 })
})

describe('getPublicAvailableSlots', () => {
  it('returns slots for the requested date', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }] },
    ])

    const result = await getPublicAvailableSlots({
      organizationId: '11111111-1111-1111-1111-111111111111',
      serviceId: '22222222-2222-2222-2222-222222222222',
      date: '2026-08-10',
    })

    expect(result).toEqual({ slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }] })
  })

  it('returns a validation error for a malformed date', async () => {
    const result = await getPublicAvailableSlots({
      organizationId: '11111111-1111-1111-1111-111111111111',
      serviceId: '22222222-2222-2222-2222-222222222222',
      date: 'not-a-date',
    })

    expect('error' in result).toBe(true)
  })
})

describe('createPublicAppointment', () => {
  const validInput = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    serviceId: '22222222-2222-2222-2222-222222222222',
    startsAt: '2026-08-10T09:00:00.000Z',
    endsAt: '2026-08-10T09:30:00.000Z',
    clientName: 'Ada Lovelace',
    clientEmail: 'ada@example.com',
  }

  it('books the appointment when the slot is still open', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { date: '2026-08-10', slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }] },
    ])
    vi.mocked(findOrCreateClientServiceRole).mockResolvedValue({ id: 'client-1', isNew: true })
    vi.mocked(createAppointmentServiceRole).mockResolvedValue({ id: 'appt-1' } as never)
    vi.mocked(sendAppointmentConfirmationEmail).mockResolvedValue()

    const result = await createPublicAppointment(validInput)

    expect(result).toEqual({ success: true, appointmentId: 'appt-1' })
    expect(createAppointmentServiceRole).toHaveBeenCalled()
  })

  it('refuses to book when the slot is no longer open', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([{ date: '2026-08-10', slots: [] }])

    const result = await createPublicAppointment(validInput)

    expect(result).toEqual({ error: 'slot_taken' })
    expect(createAppointmentServiceRole).not.toHaveBeenCalled()
  })

  it('rejects when rate limited', async () => {
    vi.mocked(checkAndConsumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })

    const result = await createPublicAppointment(validInput)

    expect('error' in result).toBe(true)
    expect(createAppointmentServiceRole).not.toHaveBeenCalled()
  })

  it('requires a turnstile token when TURNSTILE_SECRET_KEY is configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret'

    const result = await createPublicAppointment(validInput)

    expect('error' in result).toBe(true)
    expect(createAppointmentServiceRole).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run app/book/actions.test.ts`
Expected: FAIL — `getPublicAvailableSlots`/`createPublicAppointment` not exported yet.

- [ ] **Step 4: Implement the two actions**

Add to `app/book/actions.ts` (keep the existing `startPublicCall` untouched, add below it):

```ts
import { getAvailableSlots } from '@/lib/data/availability-engine'
import { findOrCreateClientServiceRole, createAppointmentServiceRole } from '@/lib/data/booking-service'
import { sendAppointmentConfirmationEmail } from '@/lib/email/send-appointment-confirmation'
import {
  getPublicAvailableSlotsSchema,
  createPublicAppointmentSchema,
  type GetPublicAvailableSlotsInput,
  type CreatePublicAppointmentInput,
} from '@/lib/validations/booking'

const MAX_BOOKINGS_PER_HOUR_PER_IP = 5

export async function getPublicAvailableSlots(
  input: GetPublicAvailableSlotsInput
): Promise<{ error: string } | { slots: { startsAt: string; endsAt: string }[] }> {
  const parsed = getPublicAvailableSlotsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const days = await getAvailableSlots(parsed.data.organizationId, {
    serviceId: parsed.data.serviceId,
    staffId: parsed.data.staffId ?? null,
    rangeStart: parsed.data.date,
    rangeEnd: parsed.data.date,
  })

  return { slots: days[0]?.slots ?? [] }
}

export async function createPublicAppointment(
  input: CreatePublicAppointmentInput
): Promise<{ error: string } | { success: true; appointmentId: string }> {
  const parsed = createPublicAppointmentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const headersList = await headers()
  const ip =
    headersList.get('x-vercel-forwarded-for') ??
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'

  if (process.env.TURNSTILE_SECRET_KEY) {
    if (!parsed.data.turnstileToken) {
      return { error: 'Verification failed. Please refresh and try again.' }
    }

    const verifyForm = new URLSearchParams()
    verifyForm.append('secret', process.env.TURNSTILE_SECRET_KEY)
    verifyForm.append('response', parsed.data.turnstileToken)
    if (ip && ip !== 'unknown') verifyForm.append('remoteip', ip)

    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyForm,
    })

    if (!verifyResponse.ok) {
      return { error: 'Verification failed. Please try again.' }
    }

    const verifyData = (await verifyResponse.json()) as { success?: boolean }
    if (!verifyData.success) {
      return { error: 'Verification failed. Please try again.' }
    }
  }

  const rateLimit = await checkAndConsumeRateLimit(`booking:${ip}`, {
    max: MAX_BOOKINGS_PER_HOUR_PER_IP,
    windowSeconds: 3600,
  })

  if (!rateLimit.allowed) {
    return { error: 'Too many booking attempts from this network. Please try again later.' }
  }

  const date = parsed.data.startsAt.slice(0, 10)
  const days = await getAvailableSlots(parsed.data.organizationId, {
    serviceId: parsed.data.serviceId,
    staffId: parsed.data.staffId ?? null,
    rangeStart: date,
    rangeEnd: date,
  })
  const stillOpen = (days[0]?.slots ?? []).some(
    (slot) => slot.startsAt === parsed.data.startsAt && slot.endsAt === parsed.data.endsAt
  )
  if (!stillOpen) {
    return { error: 'slot_taken' }
  }

  const clientPhone = parsed.data.clientPhone?.trim() || null
  const client = await findOrCreateClientServiceRole(parsed.data.organizationId, {
    name: parsed.data.clientName,
    phoneNumber: clientPhone,
    email: parsed.data.clientEmail,
  })

  const appointment = await createAppointmentServiceRole(
    parsed.data.organizationId,
    null,
    null,
    {
      title: 'Online booking',
      clientName: parsed.data.clientName,
      clientPhone,
      clientId: client.id,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      serviceId: parsed.data.serviceId,
      staffId: parsed.data.staffId ?? null,
    }
  )

  try {
    await sendAppointmentConfirmationEmail({
      to: parsed.data.clientEmail,
      clientName: parsed.data.clientName,
      businessName: parsed.data.businessName ?? 'Our office',
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
    })
  } catch (emailError) {
    console.error(`[book/actions] confirmation email failed for appointment ${appointment.id}:`, emailError)
  }

  return { success: true, appointmentId: appointment.id }
}
```

**Note:** `createAppointmentServiceRole`'s `agentId`/`conversationId` parameters must be widened from `string` to `string | null` (Task 6 already changes this file, so make this signature change there, not here — see the updated Task 6 step below). `appointments.agent_id` and `.conversation_id` are already nullable columns (confirmed in Task 1), so passing `null` through to the `.insert()` call needs no schema change. `lib/voice/booking-tools.ts`'s two call sites keep passing real `agentId`/`conversationId` strings as before — only this new public action passes `null, null`.

For `businessName` in the confirmation email: add `businessName: z.string().optional()` to `createPublicAppointmentSchema`, add a `businessName?: string` field to `CreatePublicAppointmentInput`'s usage above (already shown in the `createPublicAppointment` call above via `businessName: organizationName` from Task 9's `BookingFlow`), and use `parsed.data.businessName ?? 'Our office'` in place of the hardcoded `'Our office'` string in the `sendAppointmentConfirmationEmail` call above.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/book/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/validations/booking.ts app/book/actions.ts app/book/actions.test.ts
git commit -m "feat: add public server actions for slot lookup and appointment booking"
```

---

## Task 8: Fetch staff list on the public booking page

**Files:**
- Modify: `app/book/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getStaffForBookingPage` (Task 5).
- Produces: `staff: BookingPageStaff[]` prop passed to `BookingPagePublicClient`.

- [ ] **Step 1: Update `page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { getOrganizationBySlug } from '@/lib/data/organization-slug'
import { getOrganizationSettings } from '@/lib/data/settings'
import { getServices } from '@/lib/data/business'
import { getPublicAgentsForOrg } from '@/lib/data/agents'
import { getStaffForBookingPage } from '@/lib/data/availability-engine'
import { BookingPagePublicClient } from './booking-page-public-client'

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const org = await getOrganizationBySlug(slug)
  if (!org) notFound()

  const [settings, services, agents, staff] = await Promise.all([
    getOrganizationSettings(org.id),
    getServices(org.id),
    getPublicAgentsForOrg(org.id),
    getStaffForBookingPage(org.id),
  ])

  if (!settings.id || !settings.bookingPageEnabled) notFound()

  const agent = agents[0] ?? null

  return (
    <BookingPagePublicClient
      organizationId={org.id}
      organizationName={org.name}
      services={services.filter((s) => s.showOnBookingPage)}
      staff={staff}
      agentId={agent?.id ?? null}
      agentName={agent ? (agent.businessName ?? agent.name) : org.name}
      theme={settings.bookingPageTheme}
      accent={settings.bookingPageAccent}
    />
  )
}
```

There is no test file for this Server Component today (it's untested plumbing, matching the existing pattern for `page.tsx` files in this codebase — `booking-page/page.tsx` also has no test); no new test is added here, coverage comes from Task 9's client-component tests and Task 7's action tests.

- [ ] **Step 2: Commit**

```bash
git add app/book/[slug]/page.tsx
git commit -m "feat: fetch staff list for the public booking page"
```

(Committed alongside Task 9 is also acceptable since this file has no independent test — hold this commit until Task 9's client component compiles against the new `staff` prop, to avoid a commit that doesn't build.)

---

## Task 9: Multi-step booking flow client component

**Files:**
- Create: `app/book/[slug]/booking-flow.tsx`
- Modify: `app/book/[slug]/booking-page-public-client.tsx`
- Create: `app/book/[slug]/booking-flow.test.tsx` (if this repo has a pattern for testing client components with React Testing Library — check `components/agents/create-voice-dialog.test.tsx` for the existing pattern to follow)

**Interfaces:**
- Consumes: `Service` (`lib/data/business.ts`), `BookingPageStaff` (Task 5), `getPublicAvailableSlots`, `createPublicAppointment` (Task 7), `Calendar` (`components/ui/calendar.tsx`), `Turnstile` (`components/voice/turnstile.tsx`).
- Produces: `BookingFlow` component, rendered inside `BookingPagePublicClient`.

- [ ] **Step 1: Check the existing client-component test pattern**

Read `components/agents/create-voice-dialog.test.tsx` in full to match this codebase's exact React Testing Library setup (render helpers, mock conventions, `vi.mock` shape for server actions) before writing `booking-flow.test.tsx`. Do not invent a different pattern — this codebase already has one established convention for testing dialogs/multi-step client UI; follow it exactly (same testing-library imports, same `userEvent` usage style, same way server actions are mocked as module imports).

- [ ] **Step 2: Write failing tests for the step machine's core transitions**

Using whatever pattern Step 1 surfaced, cover at minimum:

```tsx
// app/book/[slug]/booking-flow.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./actions', () => ({
  getPublicAvailableSlots: vi.fn(),
  createPublicAppointment: vi.fn(),
}))
// Adjust the mocked module path above to match wherever the actions actually
// live relative to this file (likely '@/app/book/actions' via absolute import,
// not a relative './actions' — verify against Step 1's findings and this
// file's actual import in Step 3).

import { getPublicAvailableSlots, createPublicAppointment } from '@/app/book/actions'
import { BookingFlow } from './booking-flow'

const services = [
  { id: 'svc-1', name: 'Consultation', description: null, durationMinutes: 30, price: 50, serviceType: 'appointment' as const, showOnBookingPage: true },
]
const staff = [{ id: 'staff-1', name: 'Ada Lovelace' }]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookingFlow', () => {
  it('advances from service selection to the staff step on click', async () => {
    render(
      <BookingFlow
        organizationId="org-1"
        organizationName="Acme"
        services={services}
        staff={staff}
        theme="light"
        accent="#4F46E5"
      />
    )

    await userEvent.click(screen.getByText('Consultation'))

    expect(await screen.findByText(/any staff member/i)).toBeInTheDocument()
  })

  it('shows a "no times available" message when the slot fetch returns empty', async () => {
    vi.mocked(getPublicAvailableSlots).mockResolvedValue({ slots: [] })

    render(
      <BookingFlow
        organizationId="org-1"
        organizationName="Acme"
        services={services}
        staff={staff}
        theme="light"
        accent="#4F46E5"
      />
    )

    await userEvent.click(screen.getByText('Consultation'))
    await userEvent.click(await screen.findByText(/any staff member/i))

    await waitFor(() => expect(getPublicAvailableSlots).toHaveBeenCalled())
    expect(await screen.findByText(/no times available/i)).toBeInTheDocument()
  })

  it('submits the contact form and shows the success screen on a successful booking', async () => {
    vi.mocked(getPublicAvailableSlots).mockResolvedValue({
      slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }],
    })
    vi.mocked(createPublicAppointment).mockResolvedValue({ success: true, appointmentId: 'appt-1' })

    render(
      <BookingFlow
        organizationId="org-1"
        organizationName="Acme"
        services={services}
        staff={staff}
        theme="light"
        accent="#4F46E5"
      />
    )

    await userEvent.click(screen.getByText('Consultation'))
    await userEvent.click(await screen.findByText(/any staff member/i))
    await userEvent.click(await screen.findByText('9:00 AM'))

    await userEvent.type(await screen.findByLabelText(/name/i), 'Ada Lovelace')
    await userEvent.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await userEvent.click(screen.getByText(/confirm/i))

    expect(await screen.findByText(/booked/i)).toBeInTheDocument()
  })

  it('shows a slot-taken message and returns to the date/time step when the booking loses the race', async () => {
    vi.mocked(getPublicAvailableSlots).mockResolvedValue({
      slots: [{ startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T09:30:00.000Z' }],
    })
    vi.mocked(createPublicAppointment).mockResolvedValue({ error: 'slot_taken' })

    render(
      <BookingFlow
        organizationId="org-1"
        organizationName="Acme"
        services={services}
        staff={staff}
        theme="light"
        accent="#4F46E5"
      />
    )

    await userEvent.click(screen.getByText('Consultation'))
    await userEvent.click(await screen.findByText(/any staff member/i))
    await userEvent.click(await screen.findByText('9:00 AM'))
    await userEvent.type(await screen.findByLabelText(/name/i), 'Ada Lovelace')
    await userEvent.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await userEvent.click(screen.getByText(/confirm/i))

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run app/book/[slug]/booking-flow.test.tsx`
Expected: FAIL — `Cannot find module './booking-flow'`.

- [ ] **Step 4: Implement `BookingFlow`**

```tsx
// app/book/[slug]/booking-flow.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import type { Service } from '@/lib/data/business'
import type { BookingPageStaff } from '@/lib/data/availability-engine'
import { getPublicAvailableSlots, createPublicAppointment } from '../actions'
import { bookingAccentText } from '@/lib/booking-theme'

type Step = 'service' | 'staff' | 'datetime' | 'contact' | 'confirm' | 'success' | 'error'

function formatSlotLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(
    new Date(iso)
  )
}

export function BookingFlow({
  organizationId,
  organizationName,
  services,
  staff,
  theme = 'light',
  accent = '#4F46E5',
}: {
  organizationId: string
  organizationName: string
  services: Service[]
  staff: BookingPageStaff[]
  theme?: 'light' | 'dark'
  accent?: string
}) {
  const isDark = theme === 'dark'
  const [step, setStep] = useState<Step>('service')
  const [service, setService] = useState<Service | null>(null)
  const [staffId, setStaffId] = useState<string | undefined>(undefined)
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [slots, setSlots] = useState<{ startsAt: string; endsAt: string }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ startsAt: string; endsAt: string } | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function loadSlots(forDate: Date, chosenStaffId: string | undefined) {
    if (!service) return
    setSlotsLoading(true)
    const dateStr = forDate.toISOString().slice(0, 10)
    const result = await getPublicAvailableSlots({
      organizationId,
      serviceId: service.id,
      staffId: chosenStaffId,
      date: dateStr,
    })
    setSlotsLoading(false)
    if ('error' in result) {
      setSlots([])
      return
    }
    setSlots(result.slots)
  }

  function handleSelectService(selected: Service) {
    setService(selected)
    setStep(staff.length > 0 ? 'staff' : 'datetime')
  }

  function handleSelectStaff(id: string | undefined) {
    setStaffId(id)
    setStep('datetime')
  }

  async function handleSelectDate(selected: Date | undefined) {
    setDate(selected)
    setSelectedSlot(null)
    if (selected) await loadSlots(selected, staffId)
  }

  function handleSelectSlot(slot: { startsAt: string; endsAt: string }) {
    setSelectedSlot(slot)
    setStep('contact')
  }

  function handleContactSubmit() {
    setStep('confirm')
  }

  async function handleConfirm() {
    if (!service || !selectedSlot) return
    setSubmitting(true)
    setErrorMessage(null)

    const result = await createPublicAppointment({
      organizationId,
      serviceId: service.id,
      staffId,
      startsAt: selectedSlot.startsAt,
      endsAt: selectedSlot.endsAt,
      clientName,
      clientEmail,
      clientPhone: clientPhone || undefined,
      businessName: organizationName,
    })

    setSubmitting(false)

    if ('error' in result) {
      if (result.error === 'slot_taken') {
        setErrorMessage('That time is no longer available. Please pick another.')
        setSelectedSlot(null)
        setStep('datetime')
        if (date) await loadSlots(date, staffId)
        return
      }
      setErrorMessage(result.error)
      return
    }

    setStep('success')
  }

  const cardClass = cn(isDark && 'border-zinc-800 bg-zinc-900')

  if (step === 'service') {
    return (
      <Card className={cardClass}>
        <CardContent className="divide-y p-0">
          {services.map((svc) => (
            <button
              key={svc.id}
              type="button"
              onClick={() => handleSelectService(svc)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50"
            >
              <div>
                <p className="text-sm font-medium">{svc.name}</p>
                <p className={cn('text-xs', isDark ? 'text-zinc-400' : 'text-muted-foreground')}>
                  {svc.durationMinutes} min
                </p>
              </div>
              <p className="text-sm font-medium">${svc.price.toFixed(2)}</p>
            </button>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (step === 'staff') {
    return (
      <Card className={cardClass}>
        <CardContent className="divide-y p-0">
          <button
            type="button"
            onClick={() => handleSelectStaff(undefined)}
            className="flex w-full px-4 py-3 text-left hover:bg-muted/50"
          >
            Any staff member
          </button>
          {staff.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => handleSelectStaff(member.id)}
              className="flex w-full px-4 py-3 text-left hover:bg-muted/50"
            >
              {member.name}
            </button>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (step === 'datetime') {
    return (
      <div className="space-y-4">
        <Calendar mode="single" selected={date} onSelect={handleSelectDate} />
        {slotsLoading && <p className="text-sm text-muted-foreground">Loading times…</p>}
        {!slotsLoading && date && slots.length === 0 && (
          <p className="text-sm text-muted-foreground">No times available this day.</p>
        )}
        {!slotsLoading && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => (
              <Button key={slot.startsAt} type="button" variant="outline" onClick={() => handleSelectSlot(slot)}>
                {formatSlotLabel(slot.startsAt)}
              </Button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (step === 'contact') {
    return (
      <Card className={cardClass}>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="booking-name">Name</Label>
            <Input id="booking-name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="booking-email">Email</Label>
            <Input
              id="booking-email"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="booking-phone">Phone (optional)</Label>
            <Input id="booking-phone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
          </div>
          <Button
            type="button"
            disabled={!clientName.trim() || !clientEmail.trim()}
            onClick={handleContactSubmit}
            style={{ backgroundColor: accent, color: bookingAccentText(accent) }}
          >
            Continue
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === 'confirm') {
    return (
      <Card className={cardClass}>
        <CardContent className="space-y-4 p-4">
          <p className="text-sm">
            <strong>{service?.name}</strong>
            {selectedSlot && ` — ${formatSlotLabel(selectedSlot.startsAt)}`}
          </p>
          <p className="text-sm text-muted-foreground">{clientName} · {clientEmail}</p>
          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          <Button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            style={{ backgroundColor: accent, color: bookingAccentText(accent) }}
          >
            Confirm booking
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cardClass}>
      <CardContent className="p-4 text-sm">
        Your appointment is booked. A confirmation email is on its way to {clientEmail}.
      </CardContent>
    </Card>
  )
}
```

Check `components/ui/label.tsx` exists before importing it (`shadcn/ui` on `@base-ui/react` per this repo's conventions — if it's missing, run whatever this repo's shadcn-add command is, matching how other shadcn components were added; do not hand-roll a label component).

- [ ] **Step 5: Wire `BookingFlow` into `booking-page-public-client.tsx`**

Replace the existing static service list block (the `{services.length > 0 && (...)}` block) with:

```tsx
        {services.length > 0 && (
          <BookingFlow
            organizationId={organizationId}
            organizationName={organizationName}
            services={services}
            staff={staff}
            theme={theme}
            accent={accent}
          />
        )}
```

Add `staff` to the component's props type and destructuring:

```tsx
export function BookingPagePublicClient({
  organizationId,
  organizationName,
  services,
  staff,
  agentId,
  agentName,
  theme = 'light',
  accent = '#4F46E5',
}: {
  organizationId: string
  organizationName: string
  services: Service[]
  staff: BookingPageStaff[]
  agentId: string | null
  agentName: string
  theme?: 'light' | 'dark'
  accent?: string
}) {
```

Add the import:

```tsx
import { BookingFlow } from './booking-flow'
import type { BookingPageStaff } from '@/lib/data/availability-engine'
```

Remove the now-unused `formatPrice` function from this file if `BookingFlow` is the only place price formatting is needed (it duplicates its own inline formatting) — check no other usage remains in this file before deleting.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run app/book/[slug]/booking-flow.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/book/[slug]/booking-flow.tsx app/book/[slug]/booking-flow.test.tsx app/book/[slug]/booking-page-public-client.tsx app/book/[slug]/page.tsx
git commit -m "feat: add multi-step public booking flow (service, staff, date/time, contact, confirm)"
```

---

## Task 10: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: PASS — no regressions in any previously-passing test file, all new tests pass.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` (or this repo's equivalent script — check `package.json` for a `typecheck` script first and prefer it if present)
Expected: no type errors.

- [ ] **Step 3: Manually verify the public booking page in a browser**

Start the dev server, navigate to `/book/<a-real-slug>` for a seeded org that has at least one service with `show_on_booking_page = true` and `business_hours` configured for the current day of week. Click through: pick a service → pick staff (or "Any staff member") → pick today's date → pick a slot → fill contact info → confirm → see the success screen. Then check the org's inbox (or Resend's dashboard/logs if `RESEND_API_KEY` isn't configured locally) for the confirmation email, and check the `appointments` table row has `service_id`/`staff_id`/`client_id` populated correctly.

No commit for this task — it's a verification gate before considering the plan complete.
