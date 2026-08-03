import { describe, it, expect, vi } from 'vitest'
import {
  enableIntegration,
  disableIntegration,
  configureWebhook,
} from './actions'
import type { WebhookEventType } from '@/lib/integrations/webhook-events'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

function mockSupabase({
  user = { id: 'user-1' } as { id: string } | null,
  organizationId = 'org-1',
  upsertError = null as { message: string } | null,
  updateError = null as { message: string } | null,
} = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: upsertError })

  const updateEqSlug = vi.fn().mockResolvedValue({ error: updateError })
  const updateEqOrg = vi.fn().mockReturnValue({ eq: updateEqSlug })
  const update = vi.fn().mockReturnValue({ eq: updateEqOrg })

  const memberSingle = vi.fn().mockResolvedValue({
    data: user ? { organization_id: organizationId } : null,
  })
  const memberEq = vi.fn().mockReturnValue({ single: memberSingle })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq })

  const from = vi.fn((table: string) => {
    if (table === 'members') {
      return { select: memberSelect }
    }
    if (table === 'organization_integrations') {
      return { upsert, update }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from,
    __mocks: { upsert, update, updateEqOrg, updateEqSlug },
  }
}

describe('enableIntegration', () => {
  it('returns a validation error for an empty slug', async () => {
    const result = await enableIntegration('')
    expect(result).toEqual({ error: 'Integration is required' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await enableIntegration('google-calendar')
    expect(result).toEqual({
      error: 'You must be signed in to enable an integration.',
    })
  })

  it('scopes the upsert to the correct organization on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await enableIntegration('google-calendar')

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-42',
        integration_slug: 'google-calendar',
        is_enabled: true,
      }),
      expect.objectContaining({ onConflict: 'organization_id,integration_slug' })
    )
  })
})

describe('disableIntegration', () => {
  it('returns a validation error for an empty slug', async () => {
    const result = await disableIntegration('')
    expect(result).toEqual({ error: 'Integration is required' })
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await disableIntegration('google-calendar')
    expect(result).toEqual({
      error: 'You must be signed in to disable an integration.',
    })
  })

  it('flips is_enabled to false scoped to the org and slug, preserving config', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await disableIntegration('webhook-tool')

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.update).toHaveBeenCalledWith({ is_enabled: false })
    expect(supabase.__mocks.updateEqOrg).toHaveBeenCalledWith('organization_id', 'org-42')
    expect(supabase.__mocks.updateEqSlug).toHaveBeenCalledWith('integration_slug', 'webhook-tool')
  })
})

describe('configureWebhook', () => {
  const VALID_EVENTS: WebhookEventType[] = [
    'appointment.created',
    'conversation.completed',
  ]

  const VALID_INPUT = {
    url: 'https://hooks.example.com/receptionist',
    events: VALID_EVENTS,
    secret: 's3cret',
  }

  it('returns a validation error for an invalid URL', async () => {
    const result = await configureWebhook({ ...VALID_INPUT, url: 'not-a-url' })
    expect(result).toEqual({ error: 'Enter a valid webhook URL' })
  })

  it('returns a validation error when no events are selected', async () => {
    const result = await configureWebhook({ ...VALID_INPUT, events: [] })
    expect(result).toEqual({ error: 'Select at least one event' })
  })

  it('rejects unknown event types', async () => {
    const result = await configureWebhook({
      ...VALID_INPUT,
      events: ['appointment.created', 'bogus.event'],
    } as never)
    expect('error' in result ? result.error : undefined).toBeDefined()
  })

  it('returns an error when no user is signed in', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never
    )

    const result = await configureWebhook(VALID_INPUT)
    expect(result).toEqual({
      error: 'You must be signed in to configure an integration.',
    })
  })

  it('upserts the webhook config and enables the integration on success', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase({ organizationId: 'org-42' })
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    const result = await configureWebhook(VALID_INPUT)

    expect(result).toEqual({ success: true })
    expect(supabase.__mocks.upsert).toHaveBeenCalledWith(
      {
        organization_id: 'org-42',
        integration_slug: 'webhook-tool',
        is_enabled: true,
        config: {
          url: VALID_INPUT.url,
          events: VALID_INPUT.events,
          secret: VALID_INPUT.secret,
        },
      },
      expect.objectContaining({ onConflict: 'organization_id,integration_slug' })
    )
  })

  it('omits the secret key from config when none is provided', async () => {
    const { createClient: createSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = mockSupabase()
    vi.mocked(createSupabaseClient).mockResolvedValue(supabase as never)

    await configureWebhook({ url: VALID_INPUT.url, events: VALID_INPUT.events })

    const [payload] = supabase.__mocks.upsert.mock.calls[0]
    expect(payload.config).toEqual({
      url: VALID_INPUT.url,
      events: VALID_INPUT.events,
    })
  })
})
