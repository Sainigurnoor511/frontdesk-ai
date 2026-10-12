'use server'

import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import {
  signupSchema,
  loginSchema,
  requestPasswordResetSchema,
  updatePasswordSchema,
  totpCodeSchema,
  type SignupInput,
  type LoginInput,
  type RequestPasswordResetInput,
  type UpdatePasswordInput,
  type TotpCodeInput,
} from '@/lib/validations/auth'
import { generateUniqueSlug } from '@/lib/data/organization-slug'
import { hasRecentRecoveryClaim } from '@/lib/auth/recovery'
import {
  getAssuredUser,
  resolveMfaGate,
  mfaErrorMessage,
  MFA_MAX_ATTEMPTS,
  MFA_VERIFY_PATH,
  POST_LOGIN_PATH,
} from '@/lib/auth/mfa'
import { clearAttempts, releaseAttempt, reserveAttempt } from '@/lib/auth/mfa-attempts'

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

export async function updatePassword(input: UpdatePasswordInput): Promise<{ error: string }> {
  const parsed = updatePasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  // The only proof of a reset link is a signature-verified `recovery` entry in the session's own
  // token, recent enough. An ordinary session, aal1 or aal2, has none and cannot get here.
  if (!(await hasRecentRecoveryClaim(supabase))) {
    return { error: 'This reset link has expired. Request a new one.' }
  }
  // A recovery session that still owes its code: Supabase would refuse the change from aal1, so
  // send it to the code step, which comes back to /reset-password once it passes.
  if (!(await getAssuredUser(supabase))) return redirect(MFA_VERIFY_PATH)

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
