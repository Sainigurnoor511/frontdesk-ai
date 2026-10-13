import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { keyedHash } from '@/lib/crypto'

/**
 * Single-use recovery codes for a lost TOTP authenticator (migration `048`).
 *
 * Every function here takes the SERVICE-ROLE client. `mfa_recovery_codes` has RLS on with no
 * policies and every privilege revoked from `anon` and `authenticated`, so a session client sees
 * nothing. The `userId` argument must therefore come from a server-validated token (the gate's
 * `pending.userId`, or `getAssuredUser()`), never from the request: with RLS bypassed it is the
 * only scoping there is.
 *
 * No `server-only` import, so Vitest can load it; it is only ever imported by server actions.
 *
 * - Format: 10 symbols of Crockford base32 (`0-9`, `A-Z` without `I L O U`), shown as
 *   `XXXXX-XXXXX`. Each symbol is the low 5 bits of one `crypto.randomBytes` byte, which is
 *   uniform because 256 is a multiple of 32, so a code carries exactly 50 bits of entropy.
 * - Storage: `keyedHash()` from `lib/crypto.ts`, HMAC-SHA256 under a subkey of `ENCRYPTION_KEY`,
 *   of the canonical form (no dash, upper case). Never the plaintext. The codes are random enough
 *   that a fast keyed hash is the right tool; a leaked table without the key tests nothing.
 * - Single use: `consumeRecoveryCode()` is one conditional `UPDATE … WHERE used_at IS NULL`, read
 *   back with `.select('id')`, and is accepted only when exactly one row changed. Two concurrent
 *   submissions of one code race on the row lock and the loser's `WHERE` no longer matches.
 */

export const RECOVERY_CODE_COUNT = 10
export const RECOVERY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const TABLE = 'mfa_recovery_codes'
const HASH_PURPOSE = 'mfa-recovery-code'

// Structural, so tests can pass an in-memory fake. Every real caller passes the service-role
// `SupabaseClient`.
type ServiceClient = Pick<SupabaseClient, 'from'> & {
  auth: { admin: { mfa: Pick<SupabaseClient['auth']['admin']['mfa'], 'listFactors' | 'deleteFactor'> } }
}

/** One fresh code, `XXXXX-XXXXX`. */
export function generateRecoveryCode(): string {
  let symbols = ''
  for (const byte of randomBytes(10)) symbols += RECOVERY_CODE_ALPHABET[byte & 31]
  return `${symbols.slice(0, 5)}-${symbols.slice(5)}`
}

/**
 * The stored form of a code. `code` must already be canonical (10 symbols, no dash, upper case):
 * `recoveryCodeSchema` produces that from user input, and `issueRecoveryCodes` strips the dash.
 */
export function hashRecoveryCode(code: string): string {
  return keyedHash(HASH_PURPOSE, code)
}

/**
 * Replaces every code the user holds with a fresh set and returns the plaintext, which is the
 * only time it exists outside the user's hands: the caller shows it once and nothing reads it
 * back. Deletes first, so a failure part-way leaves the user with no codes (which settings
 * prompts them to fix), never with old codes still valid after a "regenerate".
 */
export async function issueRecoveryCodes(
  service: ServiceClient,
  userId: string
): Promise<{ codes: string[] } | { error: 'unavailable' }> {
  try {
    const removed = await service.from(TABLE).delete().eq('user_id', userId)
    if (removed.error) throw removed.error

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
    const inserted = await service.from(TABLE).insert(
      codes.map((code) => ({ user_id: userId, code_hash: hashRecoveryCode(code.replace('-', '')) }))
    )
    if (inserted.error) throw inserted.error
    return { codes }
  } catch (error) {
    console.error('[auth] recovery codes not issued:', error)
    return { error: 'unavailable' }
  }
}

/** Unused codes left for the user, or `null` when the count could not be read. */
export async function countUnusedRecoveryCodes(
  service: ServiceClient,
  userId: string
): Promise<number | null> {
  try {
    const { count, error } = await service
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('used_at', null)
    if (error) throw error
    return count ?? 0
  } catch (error) {
    console.error('[auth] recovery code count unavailable:', error)
    return null
  }
}

export type RecoveryCodeConsumption =
  /** Exactly one unused row matched and is now marked used. */
  | { status: 'consumed'; id: string }
  /** No unused code for this user has that hash: wrong, already used, or never issued. */
  | { status: 'invalid' }
  /** The database could not be asked, so the code was not evaluated. */
  | { status: 'unavailable' }

/** Marks one unused code as used, atomically. `code` is canonical, as for `hashRecoveryCode`. */
export async function consumeRecoveryCode(
  service: ServiceClient,
  userId: string,
  code: string
): Promise<RecoveryCodeConsumption> {
  let result
  try {
    result = await service
      .from(TABLE)
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('code_hash', hashRecoveryCode(code))
      .is('used_at', null)
      .select('id')
  } catch (error) {
    console.error('[auth] recovery code lookup threw:', error)
    return { status: 'unavailable' }
  }
  if (result.error || !result.data) {
    console.error('[auth] recovery code lookup failed:', result.error)
    return { status: 'unavailable' }
  }
  if (result.data.length === 1) return { status: 'consumed', id: result.data[0].id as string }
  if (result.data.length > 1) {
    // Two live rows with one hash would take a 50-bit collision. Refused rather than accepted,
    // because "exactly one row changed" is the single-use rule.
    console.error('[auth] recovery code matched more than one row; refused', { userId })
  }
  return { status: 'invalid' }
}

/**
 * Puts a consumed code back, for when the recovery could not finish after the code was accepted
 * (the factor could not be removed). Without it a transient Auth failure would burn a code.
 */
export async function restoreRecoveryCode(service: ServiceClient, id: string): Promise<void> {
  try {
    const { error } = await service.from(TABLE).update({ used_at: null }).eq('id', id)
    if (error) throw error
  } catch (error) {
    console.error('[auth] consumed recovery code not restored:', error)
  }
}

/** Deletes every code the user holds, used or not. `false` when the delete failed. */
export async function deleteRecoveryCodes(service: ServiceClient, userId: string): Promise<boolean> {
  try {
    const { error } = await service.from(TABLE).delete().eq('user_id', userId)
    if (error) throw error
    return true
  } catch (error) {
    console.error('[auth] recovery codes not deleted:', error)
    return false
  }
}

/**
 * Deletes every TOTP factor the user has, verified or not, through the admin API. GoTrue's
 * `DELETE /admin/users/{id}/factors/{factor}` destroys the factor and downgrades any session that
 * was elevated with it to `aal1`; it does not end sessions (despite the auth-js doc comment), so
 * the pending session that redeemed the code survives and, with no verified factor left, the gate
 * reads it as `satisfied`. `false` when listing or any delete failed.
 */
export async function removeTotpFactors(service: ServiceClient, userId: string): Promise<boolean> {
  try {
    const listed = await service.auth.admin.mfa.listFactors({ userId })
    if (listed.error || !listed.data) throw listed.error ?? new Error('no factor list')
    for (const factor of listed.data.factors) {
      if (factor.factor_type !== 'totp') continue
      const deleted = await service.auth.admin.mfa.deleteFactor({ userId, id: factor.id })
      if (deleted.error) throw deleted.error
    }
    return true
  } catch (error) {
    console.error('[auth] totp factor not removed after a recovery code:', error)
    return false
  }
}
