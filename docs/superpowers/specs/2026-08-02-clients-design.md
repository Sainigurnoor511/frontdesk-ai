# Design: Clients Page

Date: 2026-08-02
Status: Approved

## Context

First of six sub-projects replacing the remaining dashboard placeholder pages (Calendar, Availability, Clients, Staff, Conversations, Analytics, Integrations, Bookings page) with full CRUD backends and UI. Build order: Clients → Staff → Availability → Calendar/Bookings page → Integrations → Conversations/Analytics.

Reference: live accessibility-tree capture + screenshots of Reception.ai's Clients page and "Add New Client" dialog, obtained via the user's own logged-in account, used strictly as UX/structure reference — not their source code or literal copy. No client rows existed on the reference account initially, so a real test call was placed against their receptionist to observe the actual flow. Result: the call did not auto-create a client. It created a Messages inbox item (name, phone, AI-generated summary, "Create contact" action) under Conversations. This confirms client creation from calls is a manual promote step, deferred to the Conversations phase — noted for that spec.

## Scope

In scope:
- `clients` database table + RLS policies, scoped by `organization_id`
- Clients list page (`/clients`): search, add, edit, delete
- Add/Edit client dialog: Name, Phone Number (country code + number), Email (optional), Notes (optional)
- Empty state matching the reference structure (original copy)

Out of scope: client creation from calls/bookings. Confirmed via a live test call against the reference product that this is not fully automatic — the AI extracts caller name/phone/context into a Messages inbox (visible under Conversations), and a human clicks "Create contact" to promote it to a real client record. That promote action belongs to the Conversations phase (built later) and will call the same `createClient` server action defined here. "Added after/before" date-range filters are deferred — no client data yet to make them meaningful, revisit once Calendar/Bookings/Conversations exist. No client detail sub-page — list + dialog is sufficient for CRUD; no reference data was available to confirm a detail view's fields.

## Data Model

`clients` table:
- `id` uuid primary key default `gen_random_uuid()`
- `organization_id` uuid not null references `organizations(id)` on delete cascade
- `name` text not null
- `phone_number` text not null
- `email` text (nullable)
- `notes` text (nullable)
- `created_at` timestamptz not null default `now()`
- `updated_at` timestamptz not null default `now()`

RLS: enable row level security; select/insert/update/delete policies scoped to `organization_id in (select organization_id from members where user_id = auth.uid())`, following the exact pattern used by the `agents` table migration.

## List Page (`/clients`)

- Header: "Clients" title, subtext describing the list, "Add client" button (top right).
- Search box filtering by name/phone/email (client-side filter over the fetched list — no separate search endpoint needed at this scale).
- Table: Name, Phone Number, Email, Notes (truncated), row actions (Edit, Delete).
- Empty state: icon, "No clients yet" heading, short original explanation that clients are the people who call or book, "Add client" call to action.

## Add/Edit Dialog

Reuses the `Dialog` component (same pop-transition pattern as Guides).

Fields:
- Name — text input, required
- Phone Number — country-code select (reuse the existing country picker from the agent wizard's country-step if compatible; otherwise a minimal `+1`/text input) + number input, required
- Email — text input, optional
- Notes — textarea, optional

Submit calls a server action (`createClient` / `updateClient`) that validates via Zod, inserts/updates scoped to the current org (looked up via `auth.getUser()` + `members` filter, matching the fix already applied to `createAgent`), then revalidates the `/clients` path.

## Delete

Row action opens a confirmation (reuse `AlertDialog` if already vendored, else a simple `Dialog` with confirm/cancel) before calling a `deleteClient` server action.

## Testing

- Server actions: Vitest unit tests mocking the Supabase client, covering validation failure, successful create, successful update, successful delete, and org-scoping (a user cannot mutate another org's client).
- No E2E test infra in this project yet — verify manually via Chrome DevTools against the dev server + test account, per the established pattern.
