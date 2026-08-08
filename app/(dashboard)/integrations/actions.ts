'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { CAL_COM_SLUG } from '@/lib/integrations/calcom'
import { CALENDLY_SLUG } from '@/lib/integrations/calendly'
import { PLIVO_SLUG, SIP_TRUNK_SLUG, TWILIO_SLUG } from '@/lib/integrations/telephony'
import { WEBHOOK_SLUG } from '@/lib/integrations/webhook-events'
import {
  enableIntegrationSchema,
  configureCalComSchema,
  configureCalendlySchema,
  configurePlivoSchema,
  configureSipTrunkSchema,
  configureTwilioSchema,
  type ConfigurePlivoInput,
  type ConfigureSipTrunkInput,
  type ConfigureTwilioInput,
  type ConfigureCalendlyInput,
  type ConfigureCalComInput,
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

export async function configureCalCom(
  input: ConfigureCalComInput
): Promise<{ error: string } | { success: true }> {
  const parsed = configureCalComSchema.safeParse(input)
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

  const { apiKey, eventTypeId, timezone } = parsed.data
  const { error } = await supabase.from('organization_integrations').upsert(
    {
      organization_id: member.organization_id,
      integration_slug: CAL_COM_SLUG,
      is_enabled: true,
      config: { apiKey, eventTypeId, timezone },
    },
    { onConflict: 'organization_id,integration_slug' }
  )

  if (error) {
    return { error: 'Could not save Cal.com configuration. Please try again.' }
  }

  revalidatePath('/integrations')
  return { success: true }
}

export async function configureCalendly(
  input: ConfigureCalendlyInput
): Promise<{ error: string } | { success: true }> {
  const parsed = configureCalendlySchema.safeParse(input)
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

  const { personalAccessToken, eventTypeUri, ownerUri } = parsed.data
  const { error } = await supabase.from('organization_integrations').upsert(
    {
      organization_id: member.organization_id,
      integration_slug: CALENDLY_SLUG,
      is_enabled: true,
      config: { personalAccessToken, eventTypeUri, ownerUri },
    },
    { onConflict: 'organization_id,integration_slug' }
  )

  if (error) {
    return { error: 'Could not save Calendly configuration. Please try again.' }
  }

  revalidatePath('/integrations')
  return { success: true }
}

export async function configureTwilio(
  input: ConfigureTwilioInput
): Promise<{ error: string } | { success: true }> {
  const parsed = configureTwilioSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in to configure an integration.' }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: 'Could not determine organization.' }

  const { accountSid, authToken, fromNumber, webCallsOnly } = parsed.data
  const { error } = await supabase.from('organization_integrations').upsert(
    {
      organization_id: member.organization_id,
      integration_slug: TWILIO_SLUG,
      is_enabled: true,
      config: { accountSid, authToken, fromNumber, webCallsOnly },
    },
    { onConflict: 'organization_id,integration_slug' }
  )

  if (error) return { error: 'Could not save Twilio configuration. Please try again.' }
  revalidatePath('/integrations')
  return { success: true }
}

export async function configurePlivo(
  input: ConfigurePlivoInput
): Promise<{ error: string } | { success: true }> {
  const parsed = configurePlivoSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in to configure an integration.' }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: 'Could not determine organization.' }

  const { authId, authToken, fromNumber, webCallsOnly } = parsed.data
  const { error } = await supabase.from('organization_integrations').upsert(
    {
      organization_id: member.organization_id,
      integration_slug: PLIVO_SLUG,
      is_enabled: true,
      config: { authId, authToken, fromNumber, webCallsOnly },
    },
    { onConflict: 'organization_id,integration_slug' }
  )

  if (error) return { error: 'Could not save Plivo configuration. Please try again.' }
  revalidatePath('/integrations')
  return { success: true }
}

export async function configureSipTrunk(
  input: ConfigureSipTrunkInput
): Promise<{ error: string } | { success: true }> {
  const parsed = configureSipTrunkSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in to configure an integration.' }

  const { data: member } = await supabase
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: 'Could not determine organization.' }

  const { provider, trunkDomain, username, password, webCallsOnly } = parsed.data
  const { error } = await supabase.from('organization_integrations').upsert(
    {
      organization_id: member.organization_id,
      integration_slug: SIP_TRUNK_SLUG,
      is_enabled: true,
      config: { provider, trunkDomain, username, password, webCallsOnly },
    },
    { onConflict: 'organization_id,integration_slug' }
  )

  if (error) return { error: 'Could not save SIP trunk configuration. Please try again.' }
  revalidatePath('/integrations')
  return { success: true }
}
