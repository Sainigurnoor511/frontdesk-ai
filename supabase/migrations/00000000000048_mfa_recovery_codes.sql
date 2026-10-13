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
-- ACCESS: SERVICE ROLE ONLY. This table is user-scoped, not org-scoped, so the
-- repo's `organization_id in (select organization_id from members ...)` RLS
-- pattern does not apply. RLS is enabled with deliberately NO policies, and all
-- privileges are revoked from `anon` and `authenticated`, so the publishable key
-- cannot read, count or write these rows through PostgREST whatever session it
-- carries. Only the service-role client (which bypasses RLS) touches it, from
-- server actions that have resolved the caller's user id from a validated token.
--
-- Additive (a new table), so it is safe for CI to apply on merge.

create table if not exists mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_id_idx
  on mfa_recovery_codes (user_id);

alter table mfa_recovery_codes enable row level security;

revoke all on mfa_recovery_codes from anon, authenticated;
