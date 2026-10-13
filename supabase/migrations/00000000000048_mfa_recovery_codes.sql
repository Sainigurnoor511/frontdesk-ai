-- Single-use recovery codes for a lost TOTP authenticator.
--
-- A user who enrolls TOTP and then loses the device used to be locked out for
-- good: `/settings` is itself behind the two-factor gate, Supabase TOTP has no
-- backup codes, and the only way back was the operator runbook. Each row here is
-- one code, issued in a set of ten when the factor is verified (or regenerated
-- from settings), and redeemable once on `/verify` to remove the factor.
--
-- `code_hash` is HMAC-SHA256 of the normalized code under a key derived from
-- the server's `ENCRYPTION_KEY` (`lib/auth/recovery-codes.ts`), never the code
-- itself, so a database leak alone cannot test candidate codes. `used_at` makes
-- each code single-use: redemption is a conditional update on
-- `used_at is null`, accepted only when exactly one row changed.
--
-- `factor_id` is the TOTP factor (`auth.mfa_factors.id`) the set was issued
-- for. Redemption accepts a code only when its `factor_id` is one of the user's
-- currently verified TOTP factors, so a sheet from an earlier enrolment is dead
-- as soon as that factor is gone, even if deleting its rows failed. No foreign
-- key: GoTrue owns `auth.mfa_factors` and deletes factors itself, and a used row
-- outlives its factor on purpose (below).
--
-- Used rows are kept, with `used_at` set, as the record that a code removed
-- two-factor and when. Only unused codes are ever deleted.
--
-- ACCESS: SERVICE ROLE ONLY. This table is user-scoped, not org-scoped, so the
-- repo's `organization_id in (select organization_id from members ...)` RLS
-- pattern does not apply. RLS is enabled with deliberately NO policies, and all
-- privileges are revoked from `anon` and `authenticated`, so the publishable key
-- cannot read, count or write these rows through PostgREST whatever session it
-- carries. Only the service-role client (which bypasses RLS) touches it, from
-- server actions that have resolved the caller's user id from a validated token.
--
-- Additive (a new table and function), so it is safe for CI to apply on merge.

create table if not exists mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  factor_id uuid not null,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_id_idx
  on mfa_recovery_codes (user_id);

create index if not exists mfa_recovery_codes_user_id_factor_id_idx
  on mfa_recovery_codes (user_id, factor_id);

alter table mfa_recovery_codes enable row level security;

revoke all on mfa_recovery_codes from anon, authenticated;

-- Replaces the user's unused codes with a fresh set in ONE transaction (a
-- function body runs inside the caller's statement), so a failure part-way
-- leaves the previous set exactly as it was: never a user who believes they hold
-- working codes and holds none. Used rows are left alone as the audit trail.
--
-- `security definer` with an empty, pinned `search_path` (every name below is
-- schema-qualified), and executable by `service_role` only: Postgres grants
-- EXECUTE to PUBLIC by default, and Supabase's default privileges grant it to
-- `anon` and `authenticated` too, so all three are revoked explicitly.
create or replace function public.replace_mfa_recovery_codes(
  p_user_id uuid,
  p_factor_id uuid,
  p_hashes text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_factor_id is null or coalesce(cardinality(p_hashes), 0) = 0 then
    raise exception 'replace_mfa_recovery_codes: user, factor and at least one hash are required';
  end if;

  delete from public.mfa_recovery_codes
  where user_id = p_user_id and used_at is null;

  insert into public.mfa_recovery_codes (user_id, factor_id, code_hash)
  select p_user_id, p_factor_id, hash
  from unnest(p_hashes) as hash;
end;
$$;

revoke execute on function public.replace_mfa_recovery_codes(uuid, uuid, text[])
  from public, anon, authenticated;

grant execute on function public.replace_mfa_recovery_codes(uuid, uuid, text[])
  to service_role;
