# Booking availability engine + public multi-step booking flow

**Cycle 1 of 3** for the Bookings page overhaul (see the booking-page-builder screenshot walkthrough that kicked this off). The other two cycles — editor redesign (icon sidebar + all config sections) and live iframe preview wiring — are separate specs, built after this one, since this cycle's data model (services/staff/slots on real appointments) is what the editor and preview need to reflect.

## Why this cycle first

The public booking page (`app/book/[slug]/`) currently only shows a read-only service list plus a "talk to receptionist" call button — no way to actually book an appointment through the page. Building the editor UI or a live preview before this exists means previewing a flow that doesn't work yet. This cycle makes real booking possible; cycles 2–3 build the configuration UI and preview around it.

It also closes an existing TODO item ("Real slot/availability engine for voice booking", `docs/superpowers/TODO.md`): the voice agent's `check_availability`/`book_appointment` tools currently do a bare appointment-overlap check with no awareness of business hours, staff schedules, or time off. This cycle builds the real engine once and swaps both the public page and the voice tools onto it.

## Architecture

### `lib/data/availability-engine.ts` (new)

A pure, service-role-safe function:

```ts
getAvailableSlots(organizationId, {
  serviceId: string,
  staffId?: string,       // omit or 'any' = no staff filter
  rangeStart: string,     // ISO date
  rangeEnd: string,       // ISO date
}) => Promise<{ date: string; slots: { startsAt: string; endsAt: string }[] }[]>
```

Per day in range:

1. Resolve open hours for that weekday: if `staffId` given and a `staff_hours` row exists for that staff+weekday, use it; otherwise fall back to the org's `business_hours` row.
2. Subtract `availability_exceptions` (org-wide `closed`/`custom_hours` blocks) overlapping that date.
3. Subtract `time_off` blocks: org-wide (`scope = 'company'`) always; staff-scoped (`scope = 'staff'`, matching `staff_id`) only when a specific staff member is selected.
4. Subtract existing non-cancelled `appointments` overlapping that date — filtered to the selected staff's appointments when a `staffId` is given, otherwise all appointments for the org (no staff filter = can't assume any staff is free, so treat as fully org-wide gap subtraction).
5. Chunk remaining open gaps into `booking_slot_interval_minutes`-spaced slots (from `business_profile`), keeping only slots where a full `duration_minutes` (from the selected `services` row) fits before the gap ends.
6. Drop slots that start before `now + minimum_booking_notice_minutes`, and drop dates beyond `now + advance_booking_window_days`.

All datetime math happens in the org's `business_profile.timezone`.

`business_profile.limit_overlapping_appointments` is **not** consulted here — that flag only governs whether the internal dashboard calendar *permits* a staff member to manually double-book; it has no effect on what the engine reports as an open slot for the public page.

### Swap-in for voice booking tools

`lib/voice/booking-tools.ts`'s `check_availability` and `book_appointment` currently call `checkAvailabilityServiceRole` (bare overlap check, `lib/data/booking-service.ts`). Both switch to calling the new engine instead — `check_availability` becomes "is this exact requested slot within the engine's open slots for that day," `book_appointment` re-validates the same way before insert. `checkAvailabilityServiceRole` is removed once nothing calls it.

## Data model changes

New migration, `supabase/migrations/00000000000028_booking_availability_engine.sql`:

- `appointments`: add `service_id uuid references services(id) on delete set null`, `staff_id uuid references staff_members(id) on delete set null`. Both nullable (voice-booked appointments may not specify a service/staff; existing rows backfill to `null`).
- New `staff_hours` table: identical shape to `business_hours` but keyed by `staff_id` instead of `organization_id` (`id`, `staff_id references staff_members(id) on delete cascade`, `day_of_week smallint check (0-6)`, `is_open boolean`, `start_time time`, `end_time time`, unique `(staff_id, day_of_week)`). RLS mirrors `business_hours`'s org-membership pattern via a join to `staff_members.organization_id`.
- `time_off`: add `staff_id uuid references staff_members(id) on delete cascade` (nullable). The existing `scope` check constraint already allows `'staff'`; no constraint change needed, just the new column.

No changes to `clients` — `findOrCreateClientServiceRole` (dedup by phone, then email) is reused as-is.

## Public booking flow (`app/book/[slug]/`)

Client-side step machine added to `booking-page-public-client.tsx` (or split out if it grows too large): **service → staff → date/time → contact → confirm → success**.

- **Service step**: the existing service list becomes clickable (currently display-only) and advances the flow.
- **Staff step**: shown only if the org has any `staff_members` with `is_active` and `show_on_booking_page`. Always includes an "Any staff member" option (no `staffId` passed to the engine).
- **Date/time step**: a date picker plus a slot grid. Slots come from a new public server action `getPublicAvailableSlots(organizationId, serviceId, staffId, date)` in `app/book/actions.ts`, calling the engine with a service-role client (no auth — same public-read posture as the existing `getServices`/`getBusinessProfile` calls already gated behind `booking_page_enabled`).
- **Contact step**: name, email, phone (new `lib/validations/booking.ts` Zod schema), plus the Turnstile widget already used by the call widget (`components/voice/turnstile.tsx`, reused).
- **Confirm step**: summary of service/staff/date/time/contact info, then submits to a new `createPublicAppointment` server action.
- **Success screen**: on-screen confirmation (business name, service, date/time) — same info as the confirmation email.

The existing "Talk to your receptionist" call button is untouched and remains available alongside the booking flow, not replaced by it.

### `createPublicAppointment` (new, `app/book/actions.ts`)

Mirrors `startPublicCall`'s shape exactly:

1. Validate input against the new Zod schema.
2. Turnstile verification when `TURNSTILE_SECRET_KEY` is configured (same code path as `startPublicCall`).
3. IP-based rate limit via `checkAndConsumeRateLimit` (same 5/hour/IP default, own key prefix `booking:${ip}`).
4. Re-run `getAvailableSlots` (or a narrower single-slot re-check) for the requested exact `startsAt`/`endsAt` — if it's no longer open (someone else booked it first), return `{ error: 'slot_taken' }` without inserting.
5. `findOrCreateClientServiceRole` (reused).
6. `createAppointmentServiceRole` (reused, extended to accept and persist `serviceId`/`staffId`).
7. `sendAppointmentConfirmationEmail` (reused) — failure here is logged and swallowed, matching the voice tool's existing behavior of not failing an already-committed booking over a lesser email failure.

## Error handling

- **Race on slot**: re-validated at submit time (step 4 above); UI catches `slot_taken`, toasts it, returns the user to the date/time step, and refetches slots for that date.
- **No slots for a selected date**: slot grid shows an empty state ("No times available this day") without blocking date navigation.
- **Service duration exceeds every open gap on a day**: naturally produces zero slots that day — no special-cased error needed.
- **Zero bookable services on the page**: unchanged, existing empty state already covers this.

## Testing

- `lib/data/availability-engine.test.ts` (new): business-hours-only slots, staff-hours override, availability exceptions, org-wide time off, staff-scoped time off, existing-appointment subtraction (with and without staff filter), advance-booking-window cutoff, minimum-notice cutoff, slot-interval chunking math.
- `app/book/actions.test.ts` (extend existing): `createPublicAppointment` happy path, slot-taken race, rate-limit rejection, Turnstile failure, validation errors.
- `lib/voice/booking-tools.test.ts` (update existing): assert both tools now call the engine instead of the removed bare overlap check.

## Out of scope for this cycle

- Editor UI for configuring any of this (sidebar, service/staff toggles, appearance) — cycle 2.
- Live iframe preview of the booking flow inside the editor — cycle 3.
- Google Calendar sync of booked appointments (tracked separately in `docs/superpowers/TODO.md`).
- Rescheduling/cancellation through the public multi-step flow (the page already has a separate `Reschedule / Cancel` concept in the screenshot's preview toolbar, not addressed here).
