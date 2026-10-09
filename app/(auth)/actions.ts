'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import {
  signupSchema,
  loginSchema,
  requestPasswordResetSchema,
  updatePasswordSchema,
  type SignupInput,
  type LoginInput,
  type RequestPasswordResetInput,
  type UpdatePasswordInput,
} from '@/lib/validations/auth'
import { generateUniqueSlug } from '@/lib/data/organization-slug'
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/auth/recovery'

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

  redirect('/')
}

// Always reports success, whether or not the address has an account, so the form cannot be used to discover registered emails.
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
