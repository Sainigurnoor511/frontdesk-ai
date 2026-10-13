'use server'

import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import {
  signupSchema,
  loginSchema,
  requestPasswordResetSchema,
  updatePasswordSchema,
  totpCodeSchema,
  recoveryCodeSchema,
  type SignupInput,
  type LoginInput,
  type RequestPasswordResetInput,
  type UpdatePasswordInput,
  type TotpCodeInput,
  type RecoveryCodeInput,
} from '@/lib/validations/auth'
import { generateUniqueSlug } from '@/lib/data/organization-slug'
import { checkRecoveryClaim, hasRecentRecoveryClaim } from '@/lib/auth/recovery'
import {
  resolveMfaGate,
  resolveMfaGateWithUser,
  mfaErrorMessage,
  MFA_MAX_ATTEMPTS,
  MFA_VERIFY_PATH,
  POST_LOGIN_PATH,
} from '@/lib/auth/mfa'
import { clearAttempts, releaseAttempt, reserveAttempt } from '@/lib/auth/mfa-attempts'
import {
  consumeRecoveryCode,
  deleteUnusedRecoveryCodes,
  removeTotpFactors,
  restoreRecoveryCode,
} from '@/lib/auth/recovery-codes'
import { sendMfaRecoveryNotice } from '@/lib/email/send-mfa-recovery-notice'

function friendlyAuthError(message: string): string {
  if (message.includes('already registered')) {
    return 'An account with this email already exists.'
  }
  if (message.includes('Invalid login credentials')) {
    return 'Incorrect email or password.'
  }
  if (message.includes('rate limit')) {
    return 'Too many attempts. Please wait a few minutes and try again.'
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
  if (data.user.identities?.length === 0) {
    return { error: 'An account with this email already exists.' }
  }

  const serviceClient = createServiceRoleClient()
  const businessName = parsed.data.email.split('@')[0]
  const slug = await generateUniqueSlug(serviceClient, businessName)
  const { data: org, error: orgError } = await serviceClient
    .from('organizations')
    .insert({ name: businessName, slug })
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

/** Reasons a half-finished MFA login was ended. Shared with `login/page.tsx`'s notice map. */
export type PendingSessionEndReason = 'mfa_unavailable' | 'mfa_attempts' | 'mfa_cancelled'

/**
 * One line per security-relevant event on the challenge path, so an operator can tell a user
 * fumbling their code from an account under a guessing attempt. Deliberately only the user id and
 * a fixed reason: no code, no token, nothing that would make the log itself worth stealing.
 */
function logMfaEvent(event: string, details: Record<string, string | number | boolean>): void {
  console.warn(`[auth] mfa ${event}`, details)
}

/** Signs out the current session and redirects to /login?error=<reason>. Never returns. */
async function endPendingSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reason: PendingSessionEndReason,
  userId?: string
): Promise<never> {
  try {
    // `scope: 'local'` explicitly. auth-js 2.112.2 defaults to `scope: 'global'`, which revokes
    // every refresh token the user holds — so cancelling the challenge would sign them out of
    // their phone and every other browser, and anyone with only the password could revoke all of
    // a victim's sessions on demand by failing five codes. `signOutAllDevices()` is the one place
    // that wants global, and it says so.
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Best effort, matching `logOut`, which ignores the signOut result too. The redirect below
    // still strips the user from the app, and the gate keeps denying a session that survives,
    // so this cannot fail open.
  }
  // The attempt counter is deliberately NOT cleared here: its TTL is the lockout window, and
  // clearing it on teardown would let a locked-out requester reset the budget by signing in again.
  logMfaEvent('pending session ended', { reason, userId: userId ?? 'unknown' })
  return redirect(`/login?error=${reason}`)
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

  // No attempt-counter reset here. A successful first factor is exactly what an attacker holding
  // the password already has, so resetting on it handed out an unlimited supply of code guesses.
  // The counter is cleared only by a code that actually verifies, and otherwise expires on its own.

  // Every terminal branch below is `return`ed deliberately: the repo's test mock for
  // `next/navigation` is a non-throwing `vi.fn()`, so a bare `redirect()` would fall through to
  // the one after it and a pending user could be redirected home under test.
  const mfa = await resolveMfaGate(supabase)
  if (mfa.state === 'pending') return redirect(MFA_VERIFY_PATH)
  // An account whose only verified factor is one this app cannot challenge is not a transient
  // failure, so signing out with the generic "unavailable" notice would only loop the user back
  // to the password form. `/verify` explains the dead end and who can clear it; the session stays
  // pending, which every gate still denies.
  if (mfa.state === 'indeterminate' && mfa.reason === 'unsupported_factor') {
    return redirect(MFA_VERIFY_PATH)
  }
  if (mfa.state === 'indeterminate') return endPendingSession(supabase, 'mfa_unavailable')

  return redirect(POST_LOGIN_PATH)
}

/** Completes a pending-MFA login by verifying a 6-digit TOTP code. */
export async function verifyMfaChallenge(input: TotpCodeInput): Promise<{ error: string }> {
  const parsed = totpCodeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const mfa = await resolveMfaGate(supabase)

  if (mfa.state === 'unauthenticated') {
    return redirect('/login?error=session_expired')
  }
  if (mfa.state === 'satisfied') return redirect(POST_LOGIN_PATH)
  if (mfa.state === 'indeterminate') return endPendingSession(supabase, 'mfa_unavailable')

  // One slot is taken from the budget atomically *before* Supabase sees the code. Reading the
  // count first and recording the failure afterwards let parallel requests at count four all
  // reach `mfa.verify()`; with a reservation, at most the remaining budget can. What happens to
  // the slot depends on the outcome, and every branch below says which:
  //   verified                         -> budget cleared
  //   wrong code / non-fatal error     -> slot kept; it is the failed attempt
  //   Supabase throttled               -> slot released; the code was not evaluated
  //   challenge() threw                -> slot released; verify() never ran
  //   verify() threw                   -> slot kept; the request may have reached Supabase and
  //                                       been evaluated, so it is counted to stay conservative
  //   fatal (factor gone, feature off) -> slot kept; the session ends anyway
  const reservation = await reserveAttempt(mfa.userId)
  if (reservation.status === 'unavailable') {
    // Fail closed, keeping the pending session so the user can simply retry. The reasoning is in
    // `lib/auth/mfa-attempts.ts`.
    logMfaEvent('attempt counter unavailable', { userId: mfa.userId })
    return { error: 'Two-factor sign-in is temporarily unavailable. Please try again in a minute.' }
  }
  if (reservation.status === 'exhausted') {
    return endPendingSession(supabase, 'mfa_attempts', mfa.userId)
  }

  // challenge() + verify() rather than challengeAndVerify(), so a missing factor (enrollment
  // deleted mid-flow) is distinguishable from a wrong code. Both calls are wrapped: auth-js
  // rethrows anything that is not an `AuthError` (a transport failure, a malformed response), and
  // an unhandled rejection here leaves the form with no message and no way forward.
  let challenge
  try {
    challenge = await supabase.auth.mfa.challenge({ factorId: mfa.factorId })
  } catch (thrown) {
    console.error('[auth] mfa challenge threw:', thrown)
    await releaseAttempt(mfa.userId)
    return { error: 'Could not reach two-factor sign-in. Please try again.' }
  }

  if (challenge.error) {
    const mapped = mfaErrorMessage(challenge.error)
    if (mapped.fatal) {
      logMfaEvent('challenge unavailable', { userId: mfa.userId, code: challenge.error.code ?? '' })
      return endPendingSession(supabase, 'mfa_unavailable', mfa.userId)
    }
    // A non-fatal, non-throttled challenge failure counts against the budget as well, otherwise
    // the challenge call is an unbounded loop that never advances the counter.
    return settleFailure(supabase, mfa.userId, reservation.attempts, mapped)
  }

  let verified
  try {
    verified = await supabase.auth.mfa.verify({
      factorId: mfa.factorId,
      challengeId: challenge.data.id,
      code: parsed.data.code,
    })
  } catch (thrown) {
    console.error('[auth] mfa verify threw:', thrown)
    return { error: 'Could not reach two-factor sign-in. Please try again.' }
  }

  if (verified.error) {
    const mapped = mfaErrorMessage(verified.error)
    if (mapped.fatal) {
      logMfaEvent('challenge unavailable', { userId: mfa.userId, code: verified.error.code ?? '' })
      return endPendingSession(supabase, 'mfa_unavailable', mfa.userId)
    }
    return settleFailure(supabase, mfa.userId, reservation.attempts, mapped)
  }

  await clearAttempts(mfa.userId)
  logMfaEvent('verified', { userId: mfa.userId })
  // A session that began at a reset link came here because /callback sent it through the code
  // step first; now that it is aal2 it can set the new password. Checked on the token `verify()`
  // just issued, which keeps the session's `recovery` amr entry alongside the new `totp` one.
  const recovering = await hasRecentRecoveryClaim(supabase, {
    jwt: verified.data?.access_token,
  })
  return redirect(recovering ? '/reset-password' : POST_LOGIN_PATH)
}

/**
 * Settles a reserved attempt whose code did not verify: either gives the slot back (Supabase
 * throttled, so the code was never evaluated) or keeps it as the failure, ending the session when
 * it was the last one. Never returns normally once the budget is spent.
 */
async function settleFailure(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  attempts: number,
  mapped: ReturnType<typeof mfaErrorMessage>
): Promise<{ error: string }> {
  // Supabase's own throttling is not the user failing, so it must not use up the budget:
  // "wait a few minutes" followed immediately by a forced sign-out reads as contradictory.
  if (mapped.throttled) {
    await releaseAttempt(userId)
    logMfaEvent('throttled by supabase', { userId })
    return { error: mapped.message }
  }

  logMfaEvent('failed attempt', { userId, attempts })
  if (attempts >= MFA_MAX_ATTEMPTS) {
    return endPendingSession(supabase, 'mfa_attempts', userId)
  }
  return { error: mapped.message }
}

/**
 * Where a redeemed recovery code lands, unless the session came from a reset link (then it goes on
 * to `/reset-password`): settings, whose page reads `mfa=recovered` to show the "set up two-factor
 * again" prompt, and `sessions=active` to say the other sessions could not be signed out. None of
 * this is exported: a 'use server' module may only export async functions.
 */
const RECOVERED_SETTINGS_PATH = '/settings?tab=account&mfa=recovered'
const RECOVERED_SESSIONS_ACTIVE_PATH = `${RECOVERED_SETTINGS_PATH}&sessions=active`

/** The security notice is best effort, and a slow provider must not hold the redirect. */
const RECOVERY_NOTICE_TIMEOUT_MS = 3000

/** Grep for this marker: the notice is the only out-of-band alert that two-factor was removed. */
const RECOVERY_NOTICE_FAILED = '[mfa-recovery-notice-failed]'

const OTHER_FACTOR_REFUSAL =
  'This account has another two-factor method, so a recovery code cannot sign you in. Contact whoever runs the workspace.'

/**
 * Sends the "a recovery code was used" email, bounded by `RECOVERY_NOTICE_TIMEOUT_MS`. Never
 * rejects: every failure, including an unconfigured provider, a missing address and a timeout, is
 * logged at error level under `RECOVERY_NOTICE_FAILED`.
 */
async function sendRecoveryNoticeBounded(
  userId: string,
  email: string,
  otherSessionsRevoked: boolean
): Promise<void> {
  if (!email) {
    console.error(RECOVERY_NOTICE_FAILED, { userId, reason: 'account has no email' })
    return
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      sendMfaRecoveryNotice({ to: email, usedAt: new Date(), otherSessionsRevoked }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${RECOVERY_NOTICE_TIMEOUT_MS}ms`)),
          RECOVERY_NOTICE_TIMEOUT_MS
        )
      }),
    ])
  } catch (thrown) {
    console.error(RECOVERY_NOTICE_FAILED, { userId, error: thrown })
  } finally {
    clearTimeout(timer)
  }
}

/** `signOut({ scope: 'others' })`, reporting whether it worked rather than assuming it did. */
async function revokeOtherSessions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  try {
    // `others` keeps this session, which is the one the owner is holding. auth-js 2.112.2 sends
    // `POST /logout?scope=others` and, for that scope only, leaves the local session in place.
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) throw error
    return true
  } catch (thrown) {
    console.error('[auth] other sessions not revoked after a recovery code:', { userId, error: thrown })
    return false
  }
}

/**
 * The lost-authenticator path on `/verify`: redeems one single-use recovery code, which removes the
 * user's TOTP factor and signs out their other sessions. Named `redeem…`, not `use…`, so the hooks
 * lint rule does not mistake it for a React hook at its call sites.
 *
 * Guarded exactly like `verifyMfaChallenge`, and it spends the SAME per-user attempt budget, before
 * anything is looked up, so a recovery-code guess costs what a TOTP guess costs and alternating the
 * two paths cannot buy more than `MFA_MAX_ATTEMPTS` guesses. The slot rules mirror the TOTP path:
 *   account has a non-TOTP factor     -> refused before any slot is taken or code is looked at
 *   accepted, gate now satisfied      -> budget cleared
 *   wrong / used / stale / unknown    -> slot kept; it is the failed attempt
 *   lookup could not run              -> slot released; no code was evaluated
 *   no verified factor removed        -> code restored, slot released; the user was not wrong
 *   factor removed, gate not cleared  -> slot released; the security side still runs (below)
 *
 * Every message about the code says what is known: "still works" only when it was confirmed
 * unused, otherwise that it may have been used.
 */
export async function redeemRecoveryCode(input: RecoveryCodeInput): Promise<{ error: string }> {
  const parsed = recoveryCodeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { gate: mfa, user } = await resolveMfaGateWithUser(supabase)

  if (mfa.state === 'unauthenticated') {
    return redirect('/login?error=session_expired')
  }
  if (mfa.state === 'satisfied') return redirect(POST_LOGIN_PATH)
  if (mfa.state === 'indeterminate') return endPendingSession(supabase, 'mfa_unavailable')

  // `user` is the one the gate's own `getUser()` just validated. A recovery code removes TOTP
  // factors only, so an account holding any other verified factor would spend its code and still
  // be stuck at the gate. Refused before the budget or the code is touched.
  const verified = (user?.factors ?? []).filter((factor) => factor.status === 'verified')
  if (verified.some((factor) => factor.factor_type !== 'totp')) {
    logMfaEvent('recovery code refused: account has a non-totp factor', { userId: mfa.userId })
    return { error: OTHER_FACTOR_REFUSAL }
  }
  // A code counts only while the factor its set was issued for is still verified.
  const totpFactorIds = verified.map((factor) => factor.id)

  const reservation = await reserveAttempt(mfa.userId)
  if (reservation.status === 'unavailable') {
    logMfaEvent('attempt counter unavailable', { userId: mfa.userId, path: 'recovery_code' })
    return { error: 'Two-factor sign-in is temporarily unavailable. Please try again in a minute.' }
  }
  if (reservation.status === 'exhausted') {
    return endPendingSession(supabase, 'mfa_attempts', mfa.userId)
  }

  const service = createServiceRoleClient()
  const consumed = await consumeRecoveryCode(service, mfa.userId, parsed.data.code, totpFactorIds)
  if (consumed.status === 'unavailable') {
    await releaseAttempt(mfa.userId)
    return {
      error: consumed.codeIntact
        ? 'Could not check that recovery code. Please try again.'
        : 'Could not check that recovery code, and it may have been used. If it no longer works, try another one.',
    }
  }
  if (consumed.status === 'invalid') {
    return settleFailure(supabase, mfa.userId, reservation.attempts, {
      message: 'That recovery code is not valid or has already been used.',
      fatal: false,
      throttled: false,
    })
  }

  // Every TOTP factor is tried, and what was actually deleted is what decides the outcome. Only a
  // removed VERIFIED factor changes the account's two-factor posture; an abandoned, unverified
  // enrolment never counted at the gate.
  const removal = await removeTotpFactors(service, mfa.userId)
  const removedVerified = removal.removed.filter((id) => totpFactorIds.includes(id))

  if (removedVerified.length === 0) {
    // Nothing that matters changed, so put everything back and say exactly what is known.
    const restored = await restoreRecoveryCode(service, consumed.id)
    await releaseAttempt(mfa.userId)
    logMfaEvent('recovery code accepted but factor not removed', { userId: mfa.userId, codeRestored: restored })
    return {
      error: restored
        ? 'Could not remove two-factor authentication. Your recovery code still works. Please try again.'
        : 'Could not remove two-factor authentication, and your recovery code may have been used. If it no longer works, try another one.',
    }
  }

  // A verified factor is gone, so the account has changed whatever happens next: the owner is told
  // and the other sessions are revoked even if this session cannot be let through. Each step
  // reports its own failure and none can undo the removal.
  const otherSessionsRevoked = await revokeOtherSessions(supabase, mfa.userId)
  await sendRecoveryNoticeBounded(mfa.userId, mfa.email, otherSessionsRevoked)

  // Re-resolved, never assumed: success only when this session is now actually past the gate.
  const after = await resolveMfaGate(supabase)
  if (after.state !== 'satisfied') {
    // A factor survived (its delete failed) or the gate could not be read. The consumed code is
    // put back only if the factor it was issued for is still there, since otherwise it is dead.
    const codeStillBound = !removal.removed.includes(consumed.factorId)
    const restored = codeStillBound && (await restoreRecoveryCode(service, consumed.id))
    await releaseAttempt(mfa.userId)
    console.error('[auth] recovery code removed a factor but the gate is not satisfied', {
      userId: mfa.userId,
      removed: removal.removed.join(','),
      removalFailed: removal.failed,
      gate: after.state,
      codeRestored: restored,
    })
    return {
      error: restored
        ? 'We removed your authenticator but could not finish signing you in. Your recovery code still works. Please try again.'
        : 'We removed your authenticator but could not finish signing you in. Please try again.',
    }
  }

  // The rest cannot fail the recovery. Unused codes belonged to the removed factor and are dead by
  // factor binding even if this delete fails; the consumed row stays as the record of the use.
  await deleteUnusedRecoveryCodes(service, mfa.userId)
  await clearAttempts(mfa.userId)
  logMfaEvent('recovery code used, factor removed', {
    userId: mfa.userId,
    otherSessionsRevoked,
    removalFailed: removal.failed,
  })

  // A session that began at a reset link goes on to the password form, exactly as
  // `verifyMfaChallenge` sends it; GoTrue's password change then ends every other session. Anyone
  // else lands in settings, which prompts them to set two-factor up again (nothing is re-enrolled
  // silently) and, when revocation failed, to sign out all devices.
  const claim = await checkRecoveryClaim(supabase)
  if (claim.status === 'valid') return redirect('/reset-password')
  return redirect(otherSessionsRevoked ? RECOVERED_SETTINGS_PATH : RECOVERED_SESSIONS_ACTIVE_PATH)
}

/** The escape hatch from `/verify`: ends the pending session and returns to /login. */
export async function cancelMfaChallenge(): Promise<never> {
  const supabase = await createClient()
  return endPendingSession(supabase, 'mfa_cancelled')
}

export async function requestPasswordReset(
  input: RequestPasswordResetInput
): Promise<{ error: string } | { success: true }> {
  const parsed = requestPasswordResetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/callback?flow=recovery`,
  })

  if (error?.message.includes('rate limit')) {
    return { error: friendlyAuthError(error.message) }
  }
  if (error) {
    console.error('[auth] password reset request failed:', error.message)
  }

  return { success: true }
}

/** Not exported: a 'use server' module may only export async functions. */
const RESET_CHECK_UNAVAILABLE =
  'We could not confirm your reset link just now. Your password was not changed. Please try again in a moment.'

export async function updatePassword(input: UpdatePasswordInput): Promise<{ error: string }> {
  const parsed = updatePasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  // The only proof of a reset link is a signature-verified `recovery` entry in the session's own
  // token, recent enough. An ordinary session, aal1 or aal2, has none and cannot get here. When the
  // auth server cannot be asked, the change is refused too, but the link is not called expired.
  const claim = await checkRecoveryClaim(supabase)
  if (claim.status === 'unverifiable') return { error: RESET_CHECK_UNAVAILABLE }
  if (claim.status === 'absent') {
    return { error: 'This reset link has expired. Request a new one.' }
  }

  const mfa = await resolveMfaGate(supabase)
  // A recovery session that still owes its code: Supabase would refuse the change from aal1, so
  // send it to the code step, which comes back to /reset-password once it passes. An account on an
  // unsupported factor goes there too, because /verify explains that dead end.
  if (mfa.state === 'pending' || (mfa.state === 'indeterminate' && mfa.reason === 'unsupported_factor')) {
    return redirect(MFA_VERIFY_PATH)
  }
  // Any other non-satisfied gate is a check that could not be made (or a session that just
  // vanished). Sending that to /verify bounced a factorless session home with no message, so the
  // user believed the password had changed. Say so instead; the form can simply be resubmitted.
  if (mfa.state === 'unauthenticated') {
    return { error: 'This reset link has expired. Request a new one.' }
  }
  if (mfa.state !== 'satisfied') return { error: RESET_CHECK_UNAVAILABLE }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return {
      error: error.message.includes('different from the old password')
        ? 'Choose a password you have not used before.'
        : 'Could not update your password. Please try again.',
    }
  }

  redirect('/')
}

export async function logOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

/** Revokes every refresh token for the current user, signing out all devices/sessions. */
export async function signOutAllDevices(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login')
}

export async function signInWithGoogle(): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/callback`,
    },
  })

  if (error) {
    return { error: friendlyAuthError(error.message) }
  }
  if (data.url) {
    redirect(data.url)
  }
}
