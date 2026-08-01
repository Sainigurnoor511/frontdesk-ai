'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { signupSchema, loginSchema, type SignupInput, type LoginInput } from '@/lib/validations/auth'
import { organizationNameSchema, type OrganizationNameInput } from '@/lib/validations/organization'

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
  const { data: org, error: orgError } = await serviceClient
    .from('organizations')
    .insert({ name: businessName })
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

export async function logOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function signInWithGoogle(): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/callback`,
    },
  })

  if (error) {
    return { error: friendlyAuthError(error.message) }
  }
  if (data.url) {
    redirect(data.url)
  }
}

export async function updateOrganizationName(
  orgId: string,
  input: OrganizationNameInput
): Promise<{ error: string } | { success: true }> {
  const parsed = organizationNameSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({ name: parsed.data.name })
    .eq('id', orgId)

  if (error) {
    return { error: 'Could not update organization name. Only owners can make changes.' }
  }

  revalidatePath('/organization')
  return { success: true }
}
