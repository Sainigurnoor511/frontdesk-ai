-- Atomic reschedule, replacing the check-then-write in
-- `rescheduleAppointmentByEmailServiceRole`.
--
-- Before this, the voice `reschedule_appointment` tool and the public
-- manage-booking page both ran "read availability, decide, then UPDATE". Two
-- callers could pass the same availability check and land on the same slot, and
-- a caller could confirm one start time and overwrite an appointment that had
-- changed in between, because the UPDATE was filtered only by id and
-- organization. Both windows close here:
--
--   1. `pg_advisory_xact_lock` on the organization serializes concurrent
--      reschedules within one org, so the overlap check below cannot be
--      overtaken by another reschedule between the check and the write.
--      Reschedules are rare enough that an org-wide lock costs nothing, and the
--      lock is released when the transaction ends either way.
--   2. `p_expected_starts_at` makes the write conditional on the start time the
--      caller actually confirmed (optimistic concurrency). A mismatch, or a row
--      that has since been cancelled, returns 'conflict' and writes nothing.
--
-- Not covered, deliberately: a *new* booking inserted concurrently by
-- `createAppointmentServiceRole`, which does not take this lock. Closing that
-- too means either routing every insert through a locking function or adding an
-- overlap exclusion constraint on `appointments` — and an exclusion constraint
-- would also forbid overlaps that existing data and orgs may rely on, since
-- nothing enforces non-overlap today. Backlogged in `developer-docs/TODO.md`.
--
-- The staff scoping below mirrors `getAvailableSlots()` in
-- `lib/data/availability-engine.ts`: an appointment assigned to a staff member
-- is blocked by that staff member's appointments and by unassigned ones, while
-- an unassigned appointment is blocked org-wide.
--
-- Returns a status code rather than raising, so the caller can map each outcome
-- to its own conversational error without parsing an exception message.
create or replace function public.reschedule_appointment_atomic(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_expected_starts_at timestamptz default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid;
  v_status text;
  v_starts_at timestamptz;
  v_conflicts integer;
begin
  if p_ends_at <= p_starts_at then
    return 'invalid_window';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select staff_id, status, starts_at
    into v_staff_id, v_status, v_starts_at
  from appointments
  where id = p_appointment_id
    and organization_id = p_organization_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_status = 'cancelled' then
    return 'conflict';
  end if;

  if p_expected_starts_at is not null and v_starts_at <> p_expected_starts_at then
    return 'conflict';
  end if;

  select count(*)
    into v_conflicts
  from appointments a
  where a.organization_id = p_organization_id
    and a.id <> p_appointment_id
    and a.status <> 'cancelled'
    and a.starts_at < p_ends_at
    and a.ends_at > p_starts_at
    and (v_staff_id is null or a.staff_id is null or a.staff_id = v_staff_id);

  if v_conflicts > 0 then
    return 'destination_conflict';
  end if;

  update appointments
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_at = now()
  where id = p_appointment_id
    and organization_id = p_organization_id;

  return 'ok';
end;
$$;

-- Service-role only. The public manage-booking page and the voice tools both
-- reach this through `lib/data/booking-service.ts`, which re-verifies that the
-- caller's email owns the appointment first; nothing session-authenticated
-- calls it, so `authenticated` and `anon` get no grant.
revoke all on function public.reschedule_appointment_atomic(uuid, uuid, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.reschedule_appointment_atomic(uuid, uuid, timestamptz, timestamptz, timestamptz) to service_role;
