'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { WEBHOOK_SLUG } from '@/lib/integrations/webhook-events'
import {
  enableIntegrationSchema,
  configureWebhookSchema,
  type ConfigureWebhookInput,
} from '@/lib/validations/integration'

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
    .update({ is_enabled: false })
    .eq('organization_id', member.organization_id)
    .eq('integration_slug', parsed.data.integrationSlug)

  if (error) {
    return { error: 'Could not disable integration. Please try again.' }
  }

  revalidatePath('/integrations')
  return { success: true }
}

/**
 * Configure the webhook tool: persist the destination URL, subscribed events,
 * and optional signing secret in the integration row's `config` jsonb, and
 * enable the integration. Re-saving overwrites the previous config.
 */
export async function configureWebhook(
  input: ConfigureWebhookInput
): Promise<{ error: string } | { success: true }> {
  const parsed = configureWebhookSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to configure an integration.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Could not determine organization.' }
  }

  const { url, events, secret } = parsed.data
  const { error } = await supabase.from('organization_integrations').upsert(
    {
      organization_id: member.organization_id,
      integration_slug: WEBHOOK_SLUG,
      is_enabled: true,
      config: { url, events, ...(secret ? { secret } : {}) },
    },
    { onConflict: 'organization_id,integration_slug' }
  )

  if (error) {
    return { error: 'Could not save webhook configuration. Please try again.' }
  }

  revalidatePath('/integrations')
  return { success: true }
}
