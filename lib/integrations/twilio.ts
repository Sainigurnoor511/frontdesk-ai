import { createServiceRoleClient } from '@/lib/supabase/service-role'

type TwilioConfig = {
  accountSid?: string
  authToken?: string
  webCallsOnly?: boolean
}

async function readTwilioConfig(organizationId: string): Promise<TwilioConfig | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organization_integrations')
    .select('is_enabled, config')
    .eq('organization_id', organizationId)
    .eq('integration_slug', 'twilio')
    .maybeSingle()

  if (!data || !data.is_enabled) return null
  return (data.config as TwilioConfig | null) ?? null
}

function twilioHeaders(accountSid: string, authToken: string): HeadersInit {
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  return {
    Authorization: `Basic ${credentials}`,
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

function twilioApiError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const message = (body as { message?: string }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return fallback
}

/**
 * Purchases a real Twilio phone number for the organization and returns the
 * E.164 number plus its Twilio SID. Requires the org's Twilio integration to be
 * configured and not marked web-calls-only. `areaCode` (e.g. "415") filters the
 * search to local numbers in that area code.
 */
export async function provisionTwilioNumber(
  organizationId: string,
  areaCode?: string
): Promise<{ error: string } | { number: string; sid: string }> {
  const config = await readTwilioConfig(organizationId)
  if (!config?.accountSid || !config.authToken) {
    return {
      error: 'Twilio is not configured. Connect Twilio in the Integrations page first.',
    }
  }
  if (config.webCallsOnly === true) {
    return {
      error: 'Twilio is set to web-calls-only. Enable real phone calls in the Integrations page first.',
    }
  }

  const { accountSid, authToken } = config

  const searchParams = new URLSearchParams({
    VoiceEnabled: 'true',
    Limit: '10',
  })
  if (areaCode) {
    searchParams.set('AreaCode', areaCode)
  }

  const searchResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json?${searchParams}`,
    { headers: twilioHeaders(accountSid, authToken) }
  )

  if (!searchResponse.ok) {
    const body = await searchResponse.json().catch(() => null)
    return {
      error: twilioApiError(body, 'Could not search for available phone numbers. Check your Twilio credentials.'),
    }
  }

  const searchData = (await searchResponse.json()) as {
    available_phone_numbers?: Array<{ phone_number?: string }>
  }
  const available = searchData.available_phone_numbers ?? []
  const match = available.find((item) => typeof item.phone_number === 'string' && item.phone_number.length > 0)

  if (!match?.phone_number) {
    return {
      error: areaCode
        ? `No phone numbers available for area code ${areaCode}. Try a different area code.`
        : 'No phone numbers are currently available. Try again later.',
    }
  }

  const form = new URLSearchParams({
    PhoneNumber: match.phone_number,
    VoiceEnabled: 'true',
    FriendlyName: 'Frontdesk.ai receptionist',
  })

  const purchaseResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    {
      method: 'POST',
      headers: twilioHeaders(accountSid, authToken),
      body: form,
    }
  )

  if (!purchaseResponse.ok) {
    const body = await purchaseResponse.json().catch(() => null)
    return {
      error: twilioApiError(body, 'Could not purchase the phone number. Check your Twilio account balance and credentials.'),
    }
  }

  const purchased = (await purchaseResponse.json()) as {
    sid?: string
    phone_number?: string
  }

  if (!purchased.sid || !purchased.phone_number) {
    return { error: 'Could not purchase the phone number. Please try again.' }
  }

  return { number: purchased.phone_number, sid: purchased.sid }
}
