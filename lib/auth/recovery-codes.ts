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
 * - Factor binding: each row carries the TOTP factor its set was issued for, and a code counts
 *   (for redemption and for the remaining count) only while that factor is one of the user's
 *   verified TOTP factors. A sheet from an earlier enrolment is dead once its factor is gone, even
 *   if deleting its rows failed.
 * - Single use: `consumeRecoveryCode()` is one conditional `UPDATE … WHERE used_at IS NULL`, read
 *   back with `.select('id')`, and is accepted only when exactly one row changed. Two concurrent
 *   submissions of one code race on the row lock and the loser's `WHERE` no longer matches.
 * - Audit: used rows are kept with `used_at` set. Only unused codes are ever deleted.
 */

export const RECOVERY_CODE_COUNT = 10
export const RECOVERY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const TABLE = 'mfa_recovery_codes'
const REPLACE_FUNCTION = 'replace_mfa_recovery_codes'
const HASH_PURPOSE = 'mfa-recovery-code'

// Structural, so tests can pass an in-memory fake. Every real caller passes the service-role
// `SupabaseClient`.
type ServiceClient = Pick<SupabaseClient, 'from' | 'rpc'> & {
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
 * Replaces the user's unused codes with a fresh set bound to `factorId` (a verified TOTP factor of
 * the user) and returns the plaintext, which is the only time it exists outside the user's hands:
 * the caller shows it once and nothing reads it back.
 *
 * One call to `replace_mfa_recovery_codes()`, which deletes and inserts inside a single
 * transaction, so a failure leaves the previous set exactly as it was: the user keeps the codes
 * they saved instead of holding a sheet that silently stopped working.
 */
export async function issueRecoveryCodes(
  service: ServiceClient,
  userId: string,
  factorId: string
): Promise<{ codes: string[] } | { error: 'unavailable' }> {
  try {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
    const { error } = await service.rpc(REPLACE_FUNCTION, {
      p_user_id: userId,
      p_factor_id: factorId,
      p_hashes: codes.map((code) => hashRecoveryCode(code.replace('-', ''))),
    })
    if (error) throw error
    return { codes }
  } catch (error) {
    console.error('[auth] recovery codes not issued:', error)
    return { error: 'unavailable' }
  }
}

/**
 * Unused codes left for the user that are bound to one of `factorIds` (the user's verified TOTP
 * factors), or `null` when the count could not be read. No factors means no usable codes.
 */
export async function countUnusedRecoveryCodes(
  service: ServiceClient,
  userId: string,
  factorIds: string[]
): Promise<number | null> {
  if (factorIds.length === 0) return 0
  try {
    const { count, error } = await service
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('factor_id', factorIds)
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
  | { status: 'consumed'; id: string; factorId: string }
  /** No unused code for this user and a live factor has that hash: wrong, used, stale or unknown. */
  | { status: 'invalid' }
  /**
   * The database could not be asked, or its answer was lost, so the code was not evaluated.
   * `codeIntact` is `true` only when a re-read confirmed the code is still unused. `false` means
   * it is stamped (the lost update may have committed) or its state could not be read, so the user
   * must be told the code may have been used.
   */
  | { status: 'unavailable'; codeIntact: boolean }

/**
 * Marks one unused code as used, atomically, if it is bound to one of `factorIds` (the user's
 * verified TOTP factors, from a validated `getUser()`). `code` is canonical, as for
 * `hashRecoveryCode`.
 */
export async function consumeRecoveryCode(
  service: ServiceClient,
  userId: string,
  code: string,
  factorIds: string[]
): Promise<RecoveryCodeConsumption> {
  if (factorIds.length === 0) return { status: 'invalid' }
  const codeHash = hashRecoveryCode(code)
  let result
  try {
    result = await service
      .from(TABLE)
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('code_hash', codeHash)
      .in('factor_id', factorIds)
      .is('used_at', null)
      .select('id, factor_id')
  } catch (error) {
    console.error('[auth] recovery code lookup threw:', error)
    return { status: 'unavailable', codeIntact: await codeLeftUnused(service, userId, codeHash) }
  }
  if (result.error || !result.data) {
    // The update may have committed before its response was lost, so the code is re-read.
    console.error('[auth] recovery code lookup failed:', result.error)
    return { status: 'unavailable', codeIntact: await codeLeftUnused(service, userId, codeHash) }
  }
  if (result.data.length === 1) {
    const row = result.data[0] as { id: string; factor_id: string }
    return { status: 'consumed', id: row.id, factorId: row.factor_id }
  }
  if (result.data.length > 1) {
    // Two live rows with one hash would take a 50-bit collision. Refused rather than accepted,
    // because "exactly one row changed" is the single-use rule.
    console.error('[auth] recovery code matched more than one row; refused', { userId })
  }
  return { status: 'invalid' }
}

/**
 * After a consuming update whose response was lost (it threw, or came back as an error), finds out
 * whether the code is now stamped, by re-reading it by hash. `true` only when it is known to be
 * unused (or the hash matches nothing, so nothing was burned); `false` when it is stamped or the
 * re-read failed too.
 *
 * It reports the true state rather than putting a stamped code back, deliberately: a stamp cannot
 * be told apart from one written by a concurrent request that redeemed the same code legitimately,
 * and un-using that one would hand the code out twice. A rare database blip can therefore cost the
 * user one code, and the copy says so.
 */
async function codeLeftUnused(service: ServiceClient, userId: string, codeHash: string): Promise<boolean> {
  try {
    const { data, error } = await service
      .from(TABLE)
      .select('id, used_at')
      .eq('user_id', userId)
      .eq('code_hash', codeHash)
    if (error || !data) throw error ?? new Error('no rows returned')
    const rows = data as { id: string; used_at: string | null }[]
    return rows.every((row) => row.used_at === null)
  } catch (error) {
    console.error('[auth] recovery code state unknown after a failed lookup:', error)
    return false
  }
}

/**
 * Puts a consumed code back, for when the recovery could not finish after the code was accepted
 * (the factor could not be removed). `true` only when the database confirmed the restore, which is
 * the only case in which the user may be told the code still works.
 */
export async function restoreRecoveryCode(service: ServiceClient, id: string): Promise<boolean> {
  try {
    const { error } = await service.from(TABLE).update({ used_at: null }).eq('id', id)
    if (error) throw error
    return true
  } catch (error) {
    console.error('[auth] consumed recovery code not restored:', error)
    return false
  }
}

/**
 * Deletes every UNUSED code the user holds. Used rows stay, as the record that a code was
 * redeemed. `false` when the delete failed, which factor binding makes harmless: codes bound to a
 * removed factor are refused anyway.
 */
export async function deleteUnusedRecoveryCodes(service: ServiceClient, userId: string): Promise<boolean> {
  try {
    const { error } = await service.from(TABLE).delete().eq('user_id', userId).is('used_at', null)
    if (error) throw error
    return true
  } catch (error) {
    console.error('[auth] recovery codes not deleted:', error)
    return false
  }
}

export type TotpRemoval = {
  /** Ids of the TOTP factors that were deleted. */
  removed: string[]
  /** `true` when the list or at least one delete failed. */
  failed: boolean
}

/**
 * Deletes every TOTP factor the user has, verified or not, through the admin API, trying each one
 * even when an earlier delete failed and reporting exactly which were removed, so a caller never
 * mistakes a part-done removal for an untouched account. GoTrue's
 * `DELETE /admin/users/{id}/factors/{factor}` destroys the factor and downgrades any session that
 * was elevated with it to `aal1`; it does not end sessions (despite the auth-js doc comment), so
 * the pending session that redeemed the code survives and, with no verified factor left, the gate
 * reads it as `satisfied`.
 */
export async function removeTotpFactors(service: ServiceClient, userId: string): Promise<TotpRemoval> {
  const removed: string[] = []
  let failed = false
  let factors
  try {
    const listed = await service.auth.admin.mfa.listFactors({ userId })
    if (listed.error || !listed.data) throw listed.error ?? new Error('no factor list')
    factors = listed.data.factors
  } catch (error) {
    console.error('[auth] totp factors not listed after a recovery code:', error)
    return { removed, failed: true }
  }
  for (const factor of factors) {
    if (factor.factor_type !== 'totp') continue
    try {
      const deleted = await service.auth.admin.mfa.deleteFactor({ userId, id: factor.id })
      if (deleted.error) throw deleted.error
      removed.push(factor.id)
    } catch (error) {
      failed = true
      console.error('[auth] totp factor not removed after a recovery code:', { factorId: factor.id, error })
    }
  }
  return { removed, failed }
}
