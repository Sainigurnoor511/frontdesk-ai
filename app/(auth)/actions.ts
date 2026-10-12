'use server'

import { cookies } from 'next/headers'
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
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/auth/recovery'
import {
  resolveMfaGate,
  mfaErrorMessage,
  MFA_ATTEMPTS_COOKIE,
  MFA_ATTEMPTS_COOKIE_OPTIONS,
  MFA_MAX_ATTEMPTS,
  MFA_VERIFY_PATH,
  POST_LOGIN_PATH,
} from '@/lib/auth/mfa'

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

/** Signs out, clears the attempt cookie, redirects to /login?error=<reason>. Never returns. */
async function endPendingSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reason: PendingSessionEndReason
): Promise<never> {
  try {
    await supabase.auth.signOut()
  } catch {
    // Best effort, matching `logOut`, which ignores the signOut result too. The redirect below
    // still strips the user from the app, and the gate keeps denying a session that survives,
    // so this cannot fail open.
  }
  await clearFailedAttempts()
  return redirect(`/login?error=${reason}`)
}

/** Reads fd_mfa_attempts, increments, writes back, returns the new count. NaN is treated as 0. */
async function bumpFailedAttempts(): Promise<number> {
  const cookieStore = await cookies()
  const current = Number.parseInt(cookieStore.get(MFA_ATTEMPTS_COOKIE)?.value ?? '', 10)
  const next = (Number.isNaN(current) ? 0 : current) + 1
  cookieStore.set(MFA_ATTEMPTS_COOKIE, String(next), MFA_ATTEMPTS_COOKIE_OPTIONS)
  return next
}

async function clearFailedAttempts(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(MFA_ATTEMPTS_COOKIE)
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

  // A new pending login starts with a clean attempt budget (the counter is per-pending-login).
  await clearFailedAttempts()

  // Every terminal branch below is `return`ed deliberately: the repo's test mock for
  // `next/navigation` is a non-throwing `vi.fn()`, so a bare `redirect()` would fall through to
  // the one after it and a pending user could be redirected home under test.
  const mfa = await resolveMfaGate(supabase)
  if (mfa.state === 'pending') return redirect(MFA_VERIFY_PATH)
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
    await clearFailedAttempts()
    return redirect('/login?error=session_expired')
  }
  if (mfa.state === 'satisfied') return redirect(POST_LOGIN_PATH)
  if (mfa.state === 'indeterminate') return endPendingSession(supabase, 'mfa_unavailable')

  // challenge() + verify() rather than challengeAndVerify(), so a missing factor (enrollment
  // deleted mid-flow) is distinguishable from a wrong code.
  const challenge = await supabase.auth.mfa.challenge({ factorId: mfa.factorId })
  if (challenge.error) {
    const mapped = mfaErrorMessage(challenge.error)
    if (mapped.fatal) {
      console.error('[auth] mfa challenge unavailable:', challenge.error.code)
      return endPendingSession(supabase, 'mfa_unavailable')
    }
    return { error: mapped.message }
  }

  const verified = await supabase.auth.mfa.verify({
    factorId: mfa.factorId,
    challengeId: challenge.data.id,
    code: parsed.data.code,
  })

  if (verified.error) {
    const mapped = mfaErrorMessage(verified.error)
    if (mapped.fatal) {
      console.error('[auth] mfa challenge unavailable:', verified.error.code)
      return endPendingSession(supabase, 'mfa_unavailable')
    }
    // Supabase's own throttling is not the user failing, so it must not advance the counter:
    // "wait a few minutes" followed immediately by a forced sign-out reads as contradictory.
    if (mapped.throttled) return { error: mapped.message }
    if ((await bumpFailedAttempts()) >= MFA_MAX_ATTEMPTS) {
      return endPendingSession(supabase, 'mfa_attempts')
    }
    return { error: mapped.message }
  }

  await clearFailedAttempts()
  return redirect(POST_LOGIN_PATH)
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  if (!user || !cookieStore.has(PASSWORD_RECOVERY_COOKIE)) {
    return { error: 'This reset link has expired. Request a new one.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return {
      error: error.message.includes('different from the old password')
        ? 'Choose a password you have not used before.'
        : 'Could not update your password. Please try again.',
    }
  }

  cookieStore.delete(PASSWORD_RECOVERY_COOKIE)
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
