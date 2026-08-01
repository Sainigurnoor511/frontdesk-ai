'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { enableIntegrationSchema } from '@/lib/validations/integration'

export async function enableIntegration(
  integrationSlug: string
): Promise<{ error: string } | { success: true }> {
  const parsed = enableIntegrationSchema.safeParse({ integrationSlug })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to enable an integration.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase.from('organization_integrations').upsert(
    {
      organization_id: member.organization_id,
      integration_slug: parsed.data.integrationSlug,
      is_enabled: true,
    },
    { onConflict: 'organization_id,integration_slug' }
  )

  if (error) {
    return { error: 'Could not enable integration. Please try again.' }
  }

  revalidatePath('/integrations')
  return { success: true }
}

export async function disableIntegration(
  integrationSlug: string
): Promise<{ error: string } | { success: true }> {
  const parsed = enableIntegrationSchema.safeParse({ integrationSlug })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to disable an integration.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { error } = await supabase
    .from('organization_integrations')
    .delete()
    .eq('organization_id', member.organization_id)
    .eq('integration_slug', parsed.data.integrationSlug)

  if (error) {
    return { error: 'Could not disable integration. Please try again.' }
  }

  revalidatePath('/integrations')
  return { success: true }
}
