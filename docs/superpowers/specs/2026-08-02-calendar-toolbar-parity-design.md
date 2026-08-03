# Calendar toolbar parity: Filters, view modes, month picker, dialogs

## Goal

Match reception.ai's calendar toolbar UI exactly (5 reference screenshots: Filters
popover, month picker, view dropdown, "Add time off" dialog, "New appointment"
dialog) and make every control functionally real — no decorative dead buttons.

## Scope

1. Month picker popover (calendar grid, month/year nav)
2. View dropdown: Month / Week / 3 days / Day / Show weekends toggle
3. Filters popover: Staff / Assets / Services / Channel filters + Agenda link +
   Group-by toggle
4. New appointment dialog redesign (Service + Client selects, computed duration,
   time slots from service duration)
5. Add time off dialog redesign (Type select for scope, closed-all-day toggle)
6. Month / 3-day / Day calendar grid rendering (Week already exists)

## Data model changes

Existing tables already cover Staff (`staff_members`), Services (`services`),
Assets (`business_assets`). Two additions needed:

```sql
-- 00000000000023_appointment_associations.sql
alter table appointments
  add column staff_id uuid references staff_members(id) on delete set null,
  add column service_id uuid references services(id) on delete set null,
  add column asset_id uuid references business_assets(id) on delete set null,
  add column channel text not null default 'manual'
    check (channel in ('manual', 'phone', 'web'));

alter table time_off
  add column staff_id uuid references staff_members(id) on delete set null,
  add column asset_id uuid references business_assets(id) on delete set null;
```

`channel` defaults `'manual'` (staff-entered via this dialog). The AI-receptionist
booking flow and the public booking page set `'phone'` / `'web'` respectively
where they insert appointments (two call sites to update; grep
`from('appointments').insert`).

`time_off.scope` already distinguishes company/staff/asset; `staff_id`/`asset_id`
let a staff- or asset-scoped time-off record point at the specific row.

## Components

```
CalendarToolbar
  MonthPickerPopover      -- replaces plain dropdown trigger
  ViewMenuPopover          -- replaces plain dropdown trigger
  FiltersPopover           -- new, replaces plain Funnel icon button
CalendarGrid
  WeekView                 -- existing, unchanged
  MonthView                -- new
  ThreeDayView              -- new (reuses WeekView's hour-row renderer with 3 dates)
  DayView                   -- new (reuses WeekView's hour-row renderer with 1 date)
NewAppointmentDialog        -- rebuilt: Service select, Client select, computed Time select
NewTimeOffDialog             -- rebuilt: Type select (scope), Closed-all-day toggle
```

### MonthPickerPopover

Trigger: existing "August 2026 ▾" button. Popover: `<` Year `>` header, 4×3 month
grid, current month filled black/white, click selects month within current year
and closes; year arrows change displayed year without closing.

### ViewMenuPopover

Trigger: existing "Week ▾" button. Menu items: Month, Week, 3 days, Day (radio,
checkmark on active), divider, "Show weekends" (checkbox, toggles Sat/Sun columns
in Week/Month views — 3-day/Day views are unaffected since they don't show a
fixed weekly grid). `view` state already exists as `ViewMode`; extend the union
to `"Month" | "Week" | "3 days" | "Day"` and add `showWeekends: boolean` state.

### FiltersPopover

Trigger: replaces the plain Funnel `Button`. Popover content:
- Row of 4 pill dropdowns: Staff, Assets, Services, Channel — each a multi-select
  checklist (checkbox per item + "All" implicit when none checked = no filter).
  Data comes from `getStaffForOrg`, `getAssets`, `getServices` (already fetched
  server-side in `page.tsx` and passed down), and a static Channel list
  (`Phone`, `Web`, `Manual`).
- "AGENDA" text link — switches `view` to a new `"Agenda"` mode: a
  chronological list (grouped by day) of appointments and time-off in the
  current range, using the same filtered dataset as the grid views, just
  rendered as rows (date heading, then time + title + client + staff/service
  chips per row) instead of a grid. Not a new data source or fetch path.
- "Group: Staff ▾" — when a Staff filter or grouping is active, Week/Day views
  split each day column into per-staff sub-columns. For this pass, "Group"
  supports `Staff` only (matches the reference's default) and is a dropdown of
  one item — wiring multiple group-by dimensions is future work.

Filtering behavior: selected Staff/Assets/Services/Channel values are ANDed
across dimensions, ORed within a dimension (e.g. Staff=[Alice,Bob] AND
Channel=[Phone] shows Alice-or-Bob's Phone-channel appointments). Filters apply
client-side against the already-fetched week/month range of appointments (no
new server round-trip) since `appointments` rows will now carry `staff_id`,
`service_id`, `asset_id`, `channel`.

### NewAppointmentDialog

Replace free-text Service/Client/Time inputs with:
- **Service** `Select` sourced from `getServices` — choosing one sets
  duration from `service.durationMinutes` (replaces manual Duration input).
- **Client** `Select` sourced from `getClientsForOrg`, searchable (simple
  filter-as-you-type over the list, no new search endpoint).
- **Date** unchanged (button showing formatted date — still a static display,
  no date-picker calendar widget in this pass; matches current behavior).
- **Time** `Select` populated with slots from business hours in
  `booking_slot_interval_minutes` steps, disabled until a Service is chosen
  (matches reference's "Select a service first to set the time").
- Notes / Internal notes unchanged.
- On submit, also writes `service_id`, `client_id` (new: need
  `createAppointmentSchema` to accept these), `staff_id` (optional, no staff
  picker in the reference dialog — omit for now), `channel: 'manual'`.

### NewTimeOffDialog

- **Type** (top select in reference) = the existing `scope` field
  (Company-wide / Staff / Asset), relabeled "Type" to match reference, and when
  `Staff` or `Asset` is chosen a second select appears listing that scope's
  rows (from `getStaffForOrg` / `getAssets`) to set the new `staff_id`/`asset_id`.
- **Type** (second select in reference, "Closed all day") — a boolean toggle
  mapped to existing `allDay` field, presented as a 2-item select ("Closed all
  day" / "Custom hours"); "Custom hours" reveals start/end time selects (new;
  currently `allDay` is hardcoded `true` in the handler).
- Start Date / End Date unchanged (still static date display buttons).
- Reason unchanged.

### MonthView

Standard 6-row×7-col grid (or 5/6 rows depending on month), each cell shows day
number + up to 3 appointment title chips + "+N more" overflow, click a day cell
switches to Day view for that date. Time-off spanning a day renders as a colored
bar across the cell like the existing all-day row treatment.

### ThreeDayView / DayView

Both reuse the existing WeekView hour-row rendering (time column + striped
non-business hours + current-time line + appointment blocks), just with 1 or 3
date columns instead of 7. Extract the current per-day-column hour-cell renderer
in `calendar-client.tsx` into a shared function parameterized by the list of
dates, so Week/3-day/Day all call it with different `weekDates`-equivalents.

## Testing

- Filter combinations: single-dimension, multi-dimension AND, multi-value OR
  within a dimension, clear-all.
- View switch preserves `anchorDate` and re-derives the correct date range for
  each mode (Month needs a month-range fetch, not week-range — `page.tsx`'s
  `getWeekRange` becomes mode-aware or Month view over-fetches by re-querying
  client-side... see Open Question below).
- New appointment: service selection populates duration + unlocks time slots;
  submission persists `service_id`/`client_id`/`channel`.
- Time off: staff/asset sub-select appears only for matching Type; custom-hours
  reveals time selects and persists `all_day: false` with explicit times.

## Range-aware fetching

`page.tsx` currently fetches a fixed Sun-Sat week. It becomes mode-aware:

- Week / 3 days / Day / Agenda: fetch the range those views actually display
  (Day → single day; 3 days → 3 days from anchor; Agenda → same range as
  whatever grid mode was last active, default Week).
- Month: fetch the full displayed grid (the month's days plus the leading/
  trailing days from adjacent months that fill the 6-row grid — i.e. the same
  Mon-start week boundaries applied to the 1st and last day of the month).

`view` and `anchorDate` move from pure client state into URL search params
(`?view=Month&date=2026-08-01`) so server-side `page.tsx` can compute the
correct range per request and so switching views/navigating triggers a normal
Next.js server refetch instead of client-only re-slicing of a stale dataset.
`CalendarClient` reads its initial view/anchor from props (server-parsed
search params) and calls `router.push` with updated params on navigation/view
change, same pattern as `initialAnchorDate` today.
